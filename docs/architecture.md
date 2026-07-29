# Architecture — current (Unity) and target (React + Tauri)

---

## 1. Current architecture (Unity 6.3 LTS)

### 1.1 Module map

```
Boot
 └── LoginHandler ──onLoginSuccess──▶ APIHandler
                                        │ GET artwork
                                        ├─▶ LastFetchedData (static cache)
                                        └─▶ OnAPIDataFetchedEvent (UnityEvent broadcast)
                                                    │
        ┌───────────────────────────────────────────┼───────────────────────────┐
        ▼                                           ▼                           ▼
   GameManager                            CollectionUIManager              UIManager
   (board + rules)                        (browse/search/filter)           (puzzle screen UI)
        │                                           │
        │ tiles                                     │ card tap
        ▼                                           ▼
   TileController ×8                          ImageCropper ──▶ GameManager.StartPuzzleWithCroppedSprite
   ArrowController ×4                         (CropGridResizer, PinchableScrollRect,
        │                                      ImageZoomController)
        ▼
   WinScreen

Cross-cutting:
   ScreenManager      navigation stack + DOTween cross-fade
   OnScreenKeyboard   Windows TabTip/osk via P/Invoke  (+ TouchKeyboardBinder per input field)
   SocketConnection   socket.io "new-upload" → QR phone upload
   ImageLoader / ImageDownloader   throttled texture downloads + cache
   PopupManager       loading spinner / toasts
```

### 1.2 Key design properties (preserve these in the port)

| Property | Where | Why it matters |
|---|---|---|
| **Static data cache** (`LastFetchedData`) alongside the event | `APIHandler` | Screens activated *after* the fetch still get data. An event-only bus would leave them empty. |
| **Move-based shuffle** | `GameManager.ShuffleBoard` | Guarantees solvability without a parity check. |
| **Grid state updated before the tween** | `MoveTileRoutine` | Logic never waits on animation; input is gated by `_isAnimating`. |
| **Cached cell positions + disabled layout group** | `CacheGridPositions` | Lets tiles animate freely after the layout pass. |
| **Request-id fetch guard** | `CollectionUIManager._fetchId` | Discards stale API responses when the user types/filters fast. |
| **Explicit native-object cleanup** | `ClearBoard` | Unity leaks `Texture2D`/`Sprite` otherwise. N/A in the browser (GC handles it). |
| **Single choke point for interactability** | `UIManager.SetFooterButtonInteraction` | One place sets `interactable` + label/icon alpha, so all flows stay consistent. |

### 1.3 Known fragilities (fix in the port, don't reproduce)

1. **Screen-transition overlay could wedge the UI.** An interrupted DOTween sequence left the
   full-screen fade overlay with `blocksRaycasts = true`, making everything unclickable. Fixed by
   guarding the swap and cleaning up on both complete *and* kill. → Model transitions as explicit
   state with a timeout fallback.
2. **OS keyboard is not controllable.** `osk.exe` ignores the light theme (always black) and gives
   no reliable open/close events; `TabTip.exe` has a theme but no process-level state. → Ship an
   **in-app keyboard**.
3. **Unbounded shuffle recursion** if a shuffle lands solved. → bounded retry loop.
4. **Hardcoded API key** in `Scripts/API/API.cs`. → env/config + Rust-side proxy.
5. **Runtime-created UI** (`ArtworkName`, `Outline`, arrows) isn't visible in the scene, so
   designers can't tune it. → Make it declarative in React.

---

## 2. Target architecture (React + Tauri)

### 2.1 Process split

```
┌─────────────────────────── Tauri (Rust) ────────────────────────────┐
│ • window: fullscreen, undecorated, always-on-top (kiosk)            │
│ • commands: collection_fetch()  ← holds API base URL + key          │
│             image_fetch(url)    ← avoids CORS, enables disk cache    │
│             store get/set       ← high scores                       │
│ • optional: open_touch_keyboard() if the OS keyboard is kept        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ IPC (invoke)
┌──────────────────────────────▼──────────────────────────────────────┐
│                        Renderer (React + TS)                        │
│  ScaledCanvas  ── single scale transform (reference-px coordinates)  │
│  ├── ScreenRouter        state machine + cross-fade overlay          │
│  ├── screens/*           Puzzle, ImageSelect, Browse, Crop, Win      │
│  ├── game/*              pure logic: board, shuffle, moves, score    │
│  ├── api/*               client (abort-guarded), types, socket.io    │
│  └── ui/*                Button, Keyboard, tokens.css                │
└─────────────────────────────────────────────────────────────────────┘
```

**Rule:** all game logic in `game/*` must be **pure TypeScript** — no React, no DOM. That makes
the parity checklist in [game-logic.md §12](game-logic.md#12-port-checklist--logic-parity-tests)
unit-testable without a browser.

### 2.2 State management

Three separate concerns — don't merge them:

| Store | Contents | Lifetime |
|---|---|---|
| **Collection store** | `lastFetchedData`, filters, current page, search/sort state | app session |
| **Game store** | grid, tile positions, empty cell, moveCount, elapsed, isSolved, mode | per puzzle |
| **Navigation store** | current screen, back stack, transition phase | app session |

Zustand or `useReducer` + context are both fine. The game store should be driven by **reducer
actions** (`MOVE_TILE`, `TICK`, `SHUFFLE`, `SOLVE`) so state transitions are testable and
replayable.

### 2.3 Screen navigation

Replaces `ScreenManager`. Same custom back rules
([game-logic.md §6.3](game-logic.md#63-screen-navigation-screenmanager)):

```ts
type Phase = 'idle' | 'fadingOut' | 'fadingIn';

// Transition invariant: when phase === 'idle', the overlay MUST be
// pointer-events: none. Enforce it in a single derived style, never ad hoc —
// this is exactly the Unity bug that made the whole UI unclickable.
```

Include a **timeout fallback** (e.g. `FADE + 100 ms`) so a missed `transitionend` cannot leave the
app mid-transition.

### 2.4 Rendering the board

DOM (not canvas) for the board: 9 absolutely-positioned divs with background-position slicing
([pixel-perfect-replication.md §5.1](pixel-perfect-replication.md#51-tile-image-slicing-without-cutting-bitmaps)).
Animate with `transform: translate3d` so moves are compositor-only.

Canvas **is** appropriate for the crop screen (pan/zoom/rotate + pixel export).

### 2.5 API layer

```ts
// One in-flight collection request at a time; later requests win.
let controller: AbortController | null = null;

export async function fetchCollection(params: CollectionParams): Promise<MAPData> {
  controller?.abort();                       // mirrors Unity's _fetchId guard
  controller = new AbortController();
  return invoke<MAPData>('collection_fetch', { params }); // key stays in Rust
}
```

Socket: `socket.io-client` with `transports: ['polling']` (matching the Unity client), listening for
`new-upload`, gated to the ImageSelect/Crop screens.

### 2.6 Orientation handling

One component tree; geometry from data tables (`layout/portrait.ts`, `layout/landscape.ts`)
generated from the scene dumps. Pick the table from build config or window aspect ratio —
**not** from CSS media queries, so the two builds stay explicit and diffable.

---

## 3. Technology decisions — settled in Phase 0

| Question | Decision | Where |
|---|---|---|
| On-screen keyboard | **in-app React** — full control of skin/events; the OS route caused every keyboard bug in this project | ADR-006 |
| Animation | **CSS transitions** (durations + DOTween-equivalent easings are tokens in `src/styles/tokens.css`). No animation library until orchestration demands one | — |
| State | **Zustand** — least ceremony, works with pure-TS logic. Not installed yet; Phase 1 is pure TS with no store | Phase 2 |
| Styling | **CSS Modules + custom properties** — reference-px values read clearly and stay diffable against Unity | in use |
| Image cache | **Tauri disk cache** for kiosk resilience (survives restarts, works offline) | Phase 3 |
| Scaling | Single `transform: scale()` canvas at reference size | ADR-007 |
| Kiosk window | Declared windowed, promoted to kiosk at runtime | ADR-012 |
| WebView2 | Bundled **offline** installer, NSIS, per-machine | ADR-011 |
| Secrets | Gitignored `src-tauri/.env`, read by Rust only | ADR-009 |
| Fonts / colours | Conduit ITC only; brand palette authoritative | ADR-013 |

Full context for each: [decisions.md](decisions.md).

---

## 4. Data flow — one full round trip

```
1. Boot            → Rust collection_fetch() → MAPData → collection store
2. Puzzle screen   → pick random artwork with a primary_image
                   → image_fetch(url) → centre-crop to square → build board (shuffled)
                   → attract mode: auto-shuffle 1 move/sec
3. START           → ImageSelect screen
4. "MAP collection"→ Browse screen → fetchCollection({limit:40, page:1})
                   → render card grid → tap card
5. Crop screen     → pan/zoom/rotate → export square bitmap
6. Crop & Start    → game store: build board from bitmap, shuffle, gameplay mode
7. First move      → timer starts
8. All tiles home  → reveal 9th slice → wait 1 s → WinScreen (best + current time)
9. Play Again      → new random artwork → straight into gameplay (skip attract)
```

---

## 5. Directory layout

See [pixel-perfect-replication.md §10](pixel-perfect-replication.md#10-recommended-structure-for-the-port).

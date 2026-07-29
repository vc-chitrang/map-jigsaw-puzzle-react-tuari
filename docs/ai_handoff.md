# AI Handoff

State for the next agent. Read this first, then [architecture.md](architecture.md),
[roadmap.md](roadmap.md).

**Last updated:** 2026-07-29

---

## 1. Where the project stands

| Track | State |
|---|---|
| **Unity app** (shipping) | Live kiosk build. Active work: brand pass (fonts/colours), button press feedback, disabled-state styling, on-screen-keyboard investigation. See §7. |
| **React + Tauri port** | **Phases 0–4 built, first installer produced (v0.1.1).** 212 tests green. Full flow walks Puzzle → ImageSelect → Browse → Crop → Puzzle; Browse is live against the real collection API (32,305 artworks). Outstanding: the pixel diff (§10) and Phase 5 (win screen, router, in-app keyboard). |

**Building:** `build.bat` at the repo root. Bumps the patch version, runs the tests, builds, prints
the artefact paths. `build.bat minor|major|same` for the other version behaviours. `package.json` is
the single source of truth for the version; see [README](../README.md).

The port repo is this repository. `npm install && npm run build:fonts && npm run build:icons &&
npm run tauri:dev` gets you running — see [README.md](../README.md).

---

## 2. What Phase 0 delivered

| Area | Files | Notes |
|---|---|---|
| Scaling model | `src/canvas/reference.ts`, `useScaleFactor.ts`, `ScaledCanvas.tsx` | Unity `CanvasScaler` maths in its general (`match`) form; `ScaledCanvas` is the **only** place scaling exists |
| Kiosk lockdown | `src/kiosk/lockdown.ts`, `src-tauri/src/kiosk.rs` | JS half blocks context menu / selection / zoom / reload; Rust half promotes the window to kiosk mode (ADR-012) |
| Staff exit hatch | `src/kiosk/exitHatch.ts` | Double-Esc within 1 s. Installed from `main.tsx` **before React renders**, so it survives a failed mount |
| Design tokens | `src/styles/tokens.css` | Full brand palette; timings and easings from the spec; colour-mode switch (ADR-010) |
| Fonts | `src/styles/fonts.css`, `scripts/build-fonts.ps1` | Conduit ITC Regular + Bold as `woff2`, `font-display: block`, real Bold face (no synthetic bold) |
| Assets | `scripts/copy-assets.ps1` | 44 sprites, 0 missing; filenames normalised; mapping written to `public/assets/NAME_MAP.md` |
| Icons | `scripts/make-icon.ps1` | Squares the wide white logo on MAP Kohl (System.Drawing — no image lib needed), then `tauri icon` |
| Verification | `src/dev/ParityHarness.tsx`, `scripts/pixel-diff.mjs` | Harness renders both RectTransform idioms + a numeric readout; diff uses `pixelmatch` |
| API config | `scripts/extract-api-config.ps1`, `src-tauri/.env.example` | Writes gitignored `src-tauri/.env`; prints names and char counts only, never values (ADR-009) |
| Tests | `src/canvas/reference.test.ts` | 13 tests, all green |

## 2a. What Phase 1 delivered

Pure TypeScript game core in `src/game/` — no React, no DOM, no browser globals.

| File | Contents |
|---|---|
| `types.ts` | `Cell`, `Tile`, `BoardState`, `BoardGeometry`, `Rng`, `MoveSource`. Documents that grid `y` is top-down and the Unity sign flips are absent |
| `constants.ts` | Every §11 tunable in one place, plus `shuffleMoveCount()` |
| `board.ts` | `createSolvedBoard`, `isSolved`, `computeBoardGeometry`, `cellPosition`, `tileSlideOffset`, `determineGridSize` (kept, disabled) |
| `moves.ts` | `areAdjacent`, `movableCells`, `canMove`, `applyMove`, `ARROW_DIRECTIONS`, `arrowPlacements` |
| `shuffle.ts` | `shuffleBoard` (bounded retry, injectable RNG), `pickAutoShuffleMove` |
| `timer.ts` | `formatTime` (`--:--` for -1), `tickTimer` |
| `highScore.ts` | Unity-identical key shape, injected `KeyValueStore`, write-if-strictly-faster |
| `reducer.ts` | `gameReducer`, `canAcceptInput`, `statusText`, `shouldRevealLastSlice` |
| `testing.ts` | Seeded RNG, independent inversion-parity solvability check, in-memory store |

Two things worth not re-deriving:

* **A move is two actions.** `MOVE_STARTED` updates the grid and starts the timer; `MOVE_SETTLED`
  (dispatched when the 140 ms tween ends) increments the move count and checks for the win. This is
  Unity's ordering; collapsing it reveals the 9th slice mid-slide.
* **Attract-mode moves never check for a win**, so a chance solve during auto-shuffle cannot pop the
  win screen.

`src/game/` is not yet imported by any screen — that is Phase 2 (task P1.7).

### Verified numbers (do not re-derive)

Measured live in a real browser at four viewports — full table in
[roadmap.md](roadmap.md) Phase 0:

* scaleFactor is **exactly** `sqrt((sw/2160)×(sh/3840))` at every size tested.
* `BackButton` lands at exactly `(40, 1798, 124, 124)` reference px — Idiom B conversion confirmed.
* Portrait canvas on a landscape display: centred, clipped vertically, document not scrollable.
* Toolchain: node 22.16, npm 10.8, rust 1.96, python 3.13. `magick` and `pwsh` are **not**
  installed — hence `pixelmatch` instead of ImageMagick, and `powershell` (5.1) in npm scripts.

---

## 2b. What Phase 2 delivered

| File | Contents |
|---|---|
| `layout/rect.ts` | `rectStyle` — the ONLY place the Y flip and pivot correction happen. `textStyle` maps TMP `m_margin` to padding |
| `layout/portrait.ts` | Geometry table transcribed verbatim from `docs/ui/scene-portrait.md` |
| `ui/SpriteButton.tsx` | Sprite swap, `(−10,−10)` press offset, disabled alpha, **two** press semantics |
| `screens/PuzzleScreen/Board.tsx` | Outline, 9 tiles, 9th-slice reveal, arrows with pulse, artwork title |
| `screens/PuzzleScreen/PuzzleScreen.tsx` | Footer, START ⇄ Timer, high-score badge, preview overlay, artwork loading |
| `screens/PuzzleScreen/hooks.ts` | Timer tick, move settler, auto-shuffle, win delay |
| `storage/localStore.ts` | `KeyValueStore` over `localStorage` with an in-memory fallback |
| `image/cropToSquare.ts` | Unity `CropToSquare`, plus the bundled offline fallback set |

### Three findings that cost time — do not rediscover them

1. **Scene values override C# initialisers (ADR-015).** Four constants in `game-logic.md §11` were
   wrong: padding 0.704 not 0.9, spacing 6 not 2, shuffle multiplier 1 not 3 (→ **12** moves, not
   27), arrow factor 0.35 not 0.38. Always read the scene YAML.
2. **TMP `m_margin` is load-bearing.** `RESET` has a 90 px left margin (preview 122, new image 110).
   Without it the label sits on top of the icon. It maps to CSS padding on the centred flex box.
3. **Preview is hold-to-show, not a toggle**, and `MatchPreviewToBoard` resizes the panel to the
   board rect at runtime — the scene's full-stretch authoring never ships. `UIPressHandler` also
   releases on pointer *exit*, unlike `ButtonPressOffset`, which deliberately does not.

Also: `-webkit-mask-box-image` is how the 9-sliced high-score badge gets its `#67797F` tint, because
`border-image` cannot be tinted. WebView2 is Chromium, so the prefixed property is fine.

---

## 2c. What Phase 3 delivered

| File | Contents |
|---|---|
| `src-tauri/src/config.rs` | Env resolution (process → `.env` beside the exe → crate `.env`); logs presence and length only |
| `src-tauri/src/api.rs` | `collection_fetch`, `image_fetch` (host allow-list), `public_config`, OAuth token cache |
| `src/api/types.ts` | Response types, `SORT_MODES`, `formatResultCount`, `NO_FILTERS` |
| `src/api/client.ts` | Request-id guard, typed errors, `fetchImageAsBlobUrl` |
| `src/api/imagekit.ts` | 600 px thumbnail URLs (`CardItemUI.BuildPlaceholderUrl`) |
| `src/layout/browse.ts` | Browse geometry from the scene dump |
| `src/screens/BrowseScreen/*` | Screen, searchable `FilterDropdown`, `ArtworkCard`, `useCollection` |
| `src/screens/PuzzleScreen/loadArtwork.ts` | Collection artwork with a silent fallback to the bundled set |
| `scripts/check-api.ps1` | Login + fetch probe; prints no URL, key or token |
| `scripts/capture-window.ps1` | Window client-area capture for the parity diff |

### Four findings worth not rediscovering

1. **The collection endpoint needs OAuth *and* the key (ADR-016).** `?key=` alone → HTTP 500. The
   Unity code never sets the header because `API-Machanisam.dll` does it. Credentials are in the
   scene, not in source. `client_credentials` grant, JSON body, 30-day token.
2. **Card images must not be `primary_image`.** Those are 4K masters; forty in a grid is unusable.
   Unity builds a 600 px ImageKit URL — that named transformation (`n-image_w600`) is configured on
   MAP's account, so do not invent other names.
3. **`dotenvy` stops at the first unquoted space.** `MAP_OAUTH_SCOPE=read-artwork read-department`
   silently dropped the scope *and every line after it*. The generator now quotes such values; the
   symptom was a shorter token (1,263 vs 1,306 chars), which is easy to miss.
4. **`AbortController` cannot cancel a Tauri `invoke`.** The docs suggest abort + request id; only the
   request id actually works across the IPC boundary.

The live API is slow on first call (~8 s), which is why the client timeout is 20 s and the spinner
matters.

---

## 2d. What Phase 4 delivered

| File | Contents |
|---|---|
| `src/layout/crop.ts` | Crop + ImageSelect geometry from the scene dump |
| `src/image/cropGrid.ts` | Pure grid maths: fit, bounds, clamp, move, corner resize, grid→source mapping |
| `src/image/exportCrop.ts` | Rotation committed to pixels, square export at source resolution |
| `src/screens/CropScreen/*` | Grid overlay, 4 handles, scrim, rotate buttons |
| `src/screens/ImageSelectScreen/*` | The two-choice fork with the QR panel |
| `src/api/socket.ts` | `new-upload` listener + `extractImageUrl` |

### The big correction — read ADR-017 before touching the crop screen

The docs describe pan/pinch-zoom with a zoom slider. **None of that ships.** There is no
`PinchableScrollRect`, and `ZoomSlider`/`ResetZoomButton` are under an **inactive** `[X]` parent. What
ships is `CropGridResizer`: a square grid, four corner handles resizing about the opposite corner,
drag-to-move, clamped to the visible image, min 20 % of initial size.

That is the **third** time the scene disagreed with the docs (ADR-015 constants, ADR-016 OAuth,
ADR-017 crop). **Check the scene YAML before implementing from a doc description**, and treat an `[X]`
prefix or an inactive parent as "does not ship".

### Two CSS traps worth remembering

* `width: auto` on a **replaced** element (`<img>`) resolves to the intrinsic size and then the
  right/bottom insets are ignored. A 512 px sprite rendered at 512 px inside a 120 px button. Give
  images explicit width/height when positioning them by inset.
* `setPointerCapture` throws `NotFoundError` if the pointer has gone. Wrap it: a capture failure must
  degrade to an un-captured drag, not kill the interaction.

---

## 3. Key facts worth not re-deriving

- **Canvas reference resolutions:** Portrait **2160×3840** (primary), Landscape **3840×2160**;
  `ScaleWithScreenSize`, `MatchWidthOrHeight`, **match 0.5** ⇒ `scale = sqrt((sw/rw)×(sh/rh))`.
- **Grid is 3×3**, grid **Y is top-down** (unlike Unity UI Y). Board = `min(parentW,parentH) × 0.9`,
  square; `tileSpacing = 2`; `cellSize = (board − spacing×(cols−1))/cols`.
- **Shuffle is move-based** (27 moves for 3×3) ⇒ always solvable, no parity maths.
- **Timer starts on the first player move**, not on screen entry. Auto-shuffle moves don't start it.
- **High score key is per artwork title**: `{productName}_HighScoreKey_{title|textureName|"Default"}`;
  `-1` ⇒ `--:--`. `productName` is **`MAP Jigsaw Puzzle`** (confirmed in Unity `ProjectSettings`),
  and `tauri.conf.json` uses the same string so existing kiosk records can be migrated.
- **Collection API:** `limit` (default **40**), `page`, `q`, `department`, `classification`,
  `artist`, `culture`, `date`, `sortBy`/`sortOrder`. Response has `results.data`,
  `results.pagination`, `filters`.
- **Timings:** tile slide **140 ms** OutCubic · arrow pulse **250 ms** linear yoyo ∞ · screen fade
  **200 ms ×2** · crop rotate **300 ms** linear · auto-shuffle **1 s** · win delay **1 s**.
  All present as CSS custom properties in `tokens.css`.
- **Disabled footer buttons:** label + icon alpha **0.3**. **Press offset:** `(−10,−10)` px.
- Screens `QRScanScreen` and `Artwork Focus Screen` are **deprecated (`[X]`)** — do not port.

---

## 4. Client decisions received (2026-07-29)

All Phase-2 blockers are resolved. Recorded as ADR-011 … ADR-013.

1. **Portrait first**, kiosk display is **2160×3840 portrait**.
2. **Conduit ITC Regular + Bold only.** Licensing is not a port blocker.
3. **Brand palette is authoritative** — artwork title and caption become `#FFA300`.
   `#67797F` stays (no neutral grey in the palette).
4. **Staff exit gesture stays double-Esc.**
5. **WebView2 packaging is the port's call** → bundled offline installer (ADR-011).
6. API credentials are read from the Unity `API.cs` by script (ADR-009).

---

## 5. Security item — do not skip

`Assets/Games/Sliding-Puzzle/Scripts/API/API.cs` **hardcodes the collection API key**, so the key is
in that repository's git history and must be treated as compromised.

The port side is handled: `scripts/extract-api-config.ps1` writes it to a gitignored
`src-tauri/.env`, and Phase 3 will use it only from Rust (`collection_fetch`) so it never reaches
renderer JS or DevTools. The Tauri capability set grants the renderer window control and nothing
else.

**Still outstanding: rotate the key server-side.** Nothing in this repo can retract a value that is
already in another repo's history. Tracked as U5 in [tasks.md](tasks.md); the client asked what
rotation means and has not yet confirmed who does it.

---

## 6. Port repo layout

```
src/
├── canvas/       ScaledCanvas + scale factor — the only place scaling exists
├── kiosk/        exit hatch + browser lockdown (installed before React renders)
├── dev/          Phase 0 pixel-parity harness (App renders this until Phase 5)
├── styles/       tokens.css, fonts.css, global.css
├── game/         (Phase 1) pure TS rules — no React, no DOM
├── screens/      (Phase 2+)
├── api/          (Phase 3)
└── layout/       (Phase 2) geometry tables per orientation
src-tauri/        Rust shell: kiosk.rs now; collection_fetch + image_fetch in Phase 3
scripts/          copy-assets, build-fonts, make-icon, extract-api-config, pixel-diff
```

---

## 7. Unity-side state (current app, not the port)

Recent Unity work, unchanged by the port:

| File | Change |
|---|---|
| `Scripts/UIManager.cs` | Label **+ icon** alpha follows `interactable` (0.3 / 1.0) at the single choke point |
| `Scripts/UI/ButtonPressOffset.cs` | Press offset `(−10,−10)` on label+icon; press state mirrors `isPointerDown` (**no** exit handler) |
| `Scripts/Editor/ButtonPressOffsetSetup.cs` | Attaches the component **in-scene** + sets Sprite Swap + pressed sprites |
| `Scripts/Editor/FontSwapper.cs` | Geometria/ArchivoNarrow → Conduit ITC via `TMP_Text.font` |
| `Scripts/ScreenManager.cs` | Fail-safe cross-fade (guarded swap, `OnComplete`+`OnKill` cleanup, `LateUpdate` safety net) |
| `Scripts/GameManager.cs` | Artwork-title colour touched (superseded by ADR-013 for the port) |
| `Scripts/ONScreenKeyboard/OnScreenKeyboard.cs` | TabTip implementation — **approach superseded** by ADR-006 for the port |

Last commit on `IssueFix/KeyboardChanges`: **`792b3a0`**.

Pending manual Unity steps (editor-only, cannot be scripted headlessly):

1. `Tools ▸ MAP ▸ Setup Button Press Effect (Both Scenes)` — then **save**.
2. `Tools ▸ MAP ▸ Swap Fonts (Active Scene)` on the **Landscape** scene.
3. Verify Landscape `PlayAgainButton` — it has **no sprite**; the tool assigns `PlayAgainButton.png`.

---

## 8. Recommended next task

**Phase 5 — Win screen, the real router, in-app keyboard.**

1. **`ScreenRouter`** replacing the state switch in `App.tsx`. This is the one to get right:
   `idle | fadingOut | fadingIn`, 200 ms per half (`OutQuad` then `InQuad`), swap at full black,
   `pointer-events` derived from the phase in **exactly one place**, plus a timeout fallback so a
   dropped `transitionend` cannot wedge the app (ADR-002). The back rules are in game-logic §6.3 and
   are already honoured by the interim switch, so port them across.
2. **Win screen** — geometry at `docs/ui/scene-portrait.md` lines 603-867. Best time, your time,
   Play Again (straight into gameplay, skipping attract). The 1 s delay and the 9th-slice reveal are
   already implemented in the reducer; the screen just has to render.
3. **In-app keyboard** (ADR-006) wired to the Browse search field and the five filter popups. White,
   brand-styled. Every keyboard defect in this project came from not owning the keyboard.
4. **Tap-outside-to-dismiss**: < 15 px of movement counts as a tap, ignore drags, ignore taps that
   land on an input (`HandleKeyboardDismiss`, ui-spec §5).

**Also outstanding:** the pixel diff (§10 — unblocked at 540×960, needs an interactive shell),
`PerPageDD` (P3.11), card internal geometry (P3.12), and a real phone-upload test (P4.11).

---

## 9. Working notes for whoever continues

- **Unity MCP is not reachable from the Claude Code session** in this environment. Scene inspection
  is done by **parsing the scene YAML** (`tools/extract_ui.py`); Unity compile verification by
  reading `%LOCALAPPDATA%\Unity\Editor\Editor.log` for `error CS`.
- **Prefer code-path changes over editor-menu steps.** A previous fix relied on a human running a
  menu item; it wasn't run and the change silently did nothing (ADR-005).
- The scene `[E]`/`[D]`/`[E/D]`/`[X]` name prefixes are **authoring markers**, not code contracts.
- **Windows PowerShell 5.1 only** (`pwsh` is absent). Never redirect a native executable's stderr
  with `2>$null` in a script — 5.1 wraps each line in a `NativeCommandError` and trips
  `$ErrorActionPreference = 'Stop'` even on exit code 0. This already bit `build-fonts.ps1` once.
- `npm run predev`/`prebuild` copy assets automatically; fonts and icons are one-off steps.
- The browser-based verification path (Chrome DevTools viewport emulation against `npm run dev`) is
  how the Phase 0 and Phase 2 numbers were measured — it can emulate 2160×3840 on a smaller display,
  which neither the Tauri window nor the Unity player can.
- **Never round-trip a source file through PowerShell `Get-Content -Raw` / `Set-Content`.** In 5.1 a
  file without a BOM is read as ANSI, so UTF-8 punctuation is mangled and written back
  double-encoded. Use the editing tools instead. This corrupted `layout/portrait.ts` once and had to
  be repaired with Python.
- **Batch files must use CRLF.** `cmd.exe` mis-parses an LF-only `.bat` and reports
  `'build.bat' is not recognized as an internal or external command` even though the file exists in
  the current directory. `.gitattributes` now pins `*.bat`/`*.cmd`/`*.ps1` to CRLF; if you create a
  batch file with a tool that writes LF, convert it.

---

## 10. The pixel-diff capture — settled at 540×960

The client chose **540×960** (2026-07-29). It is 9:16, so the scale factor is uniform and geometry
parity verified at this size holds at every size; it also fits the 1920×1080 displays on this
machine, which 1080×1920 does not. The Tauri dev window is now 540×960 for the same reason.

Procedure:

```bash
"MAP Jigsaw Puzzle-0.1.2-2.exe" -screen-width 540 -screen-height 960 -screen-fullscreen 0
powershell -File scripts/capture-window.ps1 -ProcessName "MAP Jigsaw Puzzle-0.1.2-2" -Out captures/unity-540x960.png
powershell -File scripts/capture-window.ps1 -ProcessName map-jigsaw-puzzle -Out captures/port-540x960.png
node scripts/pixel-diff.mjs captures/unity-540x960.png captures/port-540x960.png captures/diff.png
```

Set `VITE_HIDE_VERSION=1` for the port capture so the version badge does not count against the diff.
Report the capture size with any number: at 540×960 text antialiasing occupies proportionally more of
the 1 % budget than it would at 4K.

**Caveat:** `scripts/capture-window.ps1` uses `Graphics.CopyFromScreen`, which fails with "The handle
is invalid" from a non-interactive session — it must be run from a normal interactive shell. That is
why P2.11 is still open: the script is written and the size is agreed, but the capture has not been
taken.

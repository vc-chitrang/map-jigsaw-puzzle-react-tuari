# AI Handoff

State for the next agent. Read this first, then [architecture.md](architecture.md),
[roadmap.md](roadmap.md).

**Last updated:** 2026-07-31

## 0. Most recent work — client feedback round (2026-07-31)

Branch `feat/client-feedback-2026-07-31`. Ten items from a landscape play test;
nine done and verified at 540×960, one blocked on the client. Full table in
[tasks.md](tasks.md) "Client feedback round". Two new ADRs:

* **ADR-041 — the high score is now GLOBAL**, one key for the whole game, a
  deliberate divergence from Unity's per-artwork key. The badge reads `--:--` once
  after this ships. Do not "fix" it back by reading `GetHighScoreKey()`.
* **ADR-042 — no native form control that draws its own popup may live inside
  `<ScaledCanvas>`.** Sort By was a `<select>`; the OS drew its popup outside the
  canvas transform, so rows rendered ~4x too large and could sit over the Date
  filter popup. It is now `SortDropdown.tsx`, sharing `openDropdown` with the
  filters.

**Play Again re-shuffles the artwork just played (ADR-048) — do not "fix" it back.**
It deliberately diverges from Unity's `ResetToLaunchMode(true)`. The seventh round
(C27–C28) also fixed the reason it appeared to "go to the home screen": it dispatched
`RESET_TO_LAUNCH_MODE`, which returns `INITIAL_GAME_STATE` and cleared the board into
attract mode, then bumped `buildToken` to fetch a new artwork behind the scrim. It is
now one `BUILD` with the existing identity, so RESET and Play Again are the same
function. `onPlayAgain` was removed because it revoked the blob URL the board was still
slicing.

**And a process lesson worth more than the fix:** C26 (ADR-047) was built on a
misreading — the client's "Play Again will always load same artwork" was a
*specification*, and it was answered as if it were a *defect report*. A whole round of
work went the wrong direction. When a client sentence could be either, ask.

A sixth round (C26) stopped Play Again repeating the artwork just won — ADR-047. Two
lessons in it. First, **the reported symptom was not reproducible**; the real defect
was odds, not mechanism: only page 1 is fetched, that pool is 40 records, so a random
pick had a 1-in-40 chance of an immediate repeat and nothing forbade it. Second, **my
first fix reproduced the bug it was meant to remove** — a flat exclusion `Set` dropped
wholesale when it emptied the pool made the just-played artwork eligible again, and a
live 2-record run showed consecutive repeats. `pickArtwork` now relaxes the recency
window **from the old end**, so the most recent id is the last one reconsidered.
Verified 7 rounds / 0 repeats on a 2-record pool; 15 unit tests. Selection lives in
`pickArtwork.ts`, kept free of Tauri and DOM imports precisely so it is testable with
a rigged RNG. **Still page 1 only — 40 of 32,299 artworks**, a deliberate trade-off
against an ~8 s uncached page fetch per build.

A fifth round (C23–C25) covered the kiosk display requirements for **both**
installers. Fullscreen and the 4K reference sizes already held — `REFERENCE` is
exactly 3840×2160 / 2160×3840, so the scale factor is **1.0** on a native 4K panel
and `reference.test.ts` already asserted it. The real gap was **lifetime**:
`kiosk::apply` ran once in `setup`, and Windows surrenders `HWND_TOPMOST` whenever
another process claims it. `kiosk::reassert` now runs on `Focused(false)` and
`Resized(_)` (ADR-046). It deliberately does **not** steal focus back — the window is
always on *top*, not always *focused*, because re-focusing fights UAC and can leave a
machine unserviceable. `lock_down` also logs the display it landed on, which
distinguishes "fullscreen on the wrong monitor" from "4K panel running a scaled
desktop resolution". **Not launched** — `cargo check` only, since a fullscreen
always-on-top window would take over the dev display.

A fourth round (C21–C22) closed it out with two design tweaks: the high-score badge
gained the thin white frame the timer plate already had (shared
`--colour-control-frame`), and START grew ~10% about its centre with its label
scaled to match. The timer keeps its scene rect, so **START is now deliberately
larger than the timer it swaps with** — that is intended, not drift.

That round also had to loosen two tests that hardcoded scene numbers on START: the
Y-flip test in `rect.test.ts` now uses the §3.2 worked example as a literal instead
of reading `startButton.rect`, and `landscape.test.ts` asserts landscape type is
*smaller than* portrait rather than asserting exact sizes. **When a value stops
being scene-derived and becomes client-tuned, assert the rule, not the number.**

**A third round (C15–C20) found the real artwork-title bug — read ADR-045.** The
title element was never at fault. ADR-043 (one day old) gave *two effects* ownership
of the board's artwork; they raced, and because the bundled load always carries a
title-less identity, the warm Rust caches (~1 ms) made it settle second and wipe the
title. `RESET_TO_LAUNCH_MODE` compounded it by clearing `identity` while `artwork`
survived. Now **one sequential owner**, collection-first, behind a build scrim
(`ui/LoadingOverlay`). This **gives up ADR-028's 0 ms boot deliberately** — the
client asked for a loading screen instead. Verified 8 rebuilds alternating warm/cold
caches: 0 blank titles.

Two traps worth keeping:

* **Inline `textStyle(...)` beats your CSS class.** It emits `paddingRight` as a
  longhand from the TMP margin, so `.dropdownLabel`'s `padding-right: 56px` was
  silently zero and long values ran under the chevron. Use an inset (`right`) for
  anything `textStyle` might also set.
* **Equal `z-index` is decided by DOM order.** The dropdown popup and the Browse
  loading overlay were both 50, and the card container comes later, so the scrim
  covered a popup the visitor had just opened.

A second round the same day added four more (C11–C14), all done:

* **ADR-043 — attract mode now upgrades to a titled collection artwork** in the
  background. This resolves C1: the title mechanism was never broken, the bundled
  offline images just have no title. The bundled image still loads first at 0 ms
  (ADR-028 intact) and the titled piece replaces it only while still in attract
  mode. **Offline the home screen still shows no title — that is correct, and is
  what Unity does for a local texture.**
* **ADR-044 — one radius token, `--radius-control: 32px`**, for every control the
  port draws itself. The high-score badge was a full pill and the timer nearly
  square; both now match the footer button art. The timer plate and the badge are
  CSS boxes now, so `timer-background.svg` and `circle-9sliced.png` are no longer
  referenced by the Puzzle screen (kept on disk as the colour record).

Two smaller ones: Clear Filters is sized to match its filter title (a deliberate
divergence from the scene, asserted as a *match* in `screens.test.ts` rather than
as a number), and dropdown rows grow instead of clipping — the fixed 60 px row
height made long artist names overlap the row beneath.

**Test count is 310**, not 308: five `resolveIdentifier` tests went away with
ADR-041 and three global-key tests replaced them.

---

## 1. Where the project stands

| Track | State |
|---|---|
| **Unity app** (shipping) | Live kiosk build. Active work: brand pass (fonts/colours), button press feedback, disabled-state styling, on-screen-keyboard investigation. See §7. |
| **React + Tauri port** | **Phases 0–5 complete; Phase 6 all geometry done.** 308 vitest + 16 Pester tests green. The whole loop plays end to end in **both orientations** — all five screens now render from per-orientation tables. **Auto-start + crash-restart landed (ADR-024). Arrow layer ordering updated (ADR-026). Browse card image-only & Filter By aligned (ADR-027). Image loading & boot optimized (ADR-028). Browse screen scrollbar hidden (ADR-029). Collection API JSON disk caching & numeric PageNumbers bar landed (ADR-030). Card section full-coverage loading overlay fixed (ADR-031). 27-frame `/assets/common/loading.png` sprite sheet animation (ADR-032). Smooth blurLoading transition (ADR-033). ImageSelect divider line (ADR-034). 21 gameplay vector SVG assets integrated (ADR-035). Mouse cursor enabled in release builds (ADR-036). Compile-time fallback API config baked into release binary (ADR-037). Clean vector up/down arrows & MAP logo vector header landed (ADR-038). Full SVG asset integration across screens (ADR-039). New Image routes to QR screen & Crop Start button Y-aligned in release v0.1.11 (ADR-040).** Outstanding: the pixel diff (§10), perf/soak on real hardware, and code signing. |

**Building:** `build.bat` at the repo root — `build.bat` for portrait, `build.bat landscape` for
landscape. Bumps the patch version, runs the tests, builds, prints the artefact paths. Add `minor`,
`major` or `same` in either argument position for the other version behaviours. Portrait and landscape
are **two separate installers** that coexist (ADR-020). `package.json` is the single source of truth
for the version; see [README](../README.md).

**Starting a fresh session?** [next-session-prompt.md](next-session-prompt.md) is a paste-ready
briefing that gets a new chat productive without re-reading everything.

The port repo is this repository. `npm install && npm run build:fonts && npm run build:icons &&
npm run tauri:dev` gets you running — see [README.md](../README.md).

**Moving to another machine:** the built app needs nothing from Unity, but a fresh clone cannot be
built without it — `public/assets/` (44 sprites, 8.4 MB), `public/fonts/` (2 woff2) and
`src-tauri/.env` are gitignored and regenerated from the Unity project. Icons *are* committed. Full
procedure and the alternative (copy those three artefacts instead) are in
[README §Moving to another machine](../README.md).

**Git (settled 2026-07-30).** `origin` is
`https://github.com/vc-chitrang/map-jigsaw-puzzle-react-tuari.git`, `main` tracks it, and everything
through the landscape work is pushed. The long-standing 403 is gone: the old remote belonged to a
different account than the stored credential. Work on a branch off `main` and open a PR.

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

## 2e. What Phase 5 delivered

| File | Contents |
|---|---|
| `src/navigation/router.ts` | Pure transition state machine + `resolveBack`. `overlayPointerEvents` is the ONE place pointer-events is decided |
| `src/navigation/ScreenRouter.tsx` | Overlay + the two timers (primary advance, recovery force-idle) |
| `src/layout/win.ts` | Win screen geometry, with the alignments read from the scene YAML |
| `src/screens/WinScreen/*` | Popup, scores, Play Again |
| `src/ui/keyboard/*` | Layout + pure key handling, and the keyboard component |

### The router is the thing to not break

`phase === 'idle'` MUST imply `pointer-events: none`. That is the Unity bug (ADR-002) in one line.
It is enforced by `overlayPointerEvents` being the only place the decision is made, and asserted by
an exhaustive walk of the action space in `router.test.ts`. If you add a second condition to the
overlay's style, you have reintroduced the bug.

`FORCE_IDLE` is the recovery hatch and is safe from any phase. The `ScreenRouter` fires it on a
timer that should never be reached; it logs a warning if it is.

### Three bugs Phase 5 surfaced, all worth remembering

1. **A passing DOM assertion is not a visible UI.** The win screen was completely covered by the
   preview panel, yet `innerText` contained "You Win!" and my check went green. The screenshot caught
   it. Nested overlays need explicit `z-index` when the Unity original relied on sibling order
   (ADR-018).
2. **Clearing an already-null prop changes no dependency.** Home mid-game reset nothing because the
   only signal was `setPreparedArtwork(null)` and it was already null. Use an explicit token when the
   owner must be able to trigger an action unconditionally.
3. **A controlled component that computes from its `value` prop loses fast input.** Four keyboard
   presses in one React batch all read the same stale string. Pass an updater, or hold the value in
   the component — never both.

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

## 2f. What Phase 6 delivered so far

| File | Contents |
|---|---|
| `src/layout/landscape.ts` | Landscape Puzzle geometry, with a table of every way it differs from portrait |
| `src/layout/chrome.ts` | The parts that differ only by NUMBER, selected by orientation |
| `src/screens/PuzzleScreen/LandscapeFooter.tsx` | The flex-row footer (`HorizontalLayoutGroup`) |
| `src/styles/tokens.css` | Added `--chrome-*` neutrals |

Switch orientation with `VITE_ORIENTATION=landscape` at build time.

### Landscape is a different design, not a rearrangement

Back button 72² not 124². Logo top-right not top-centre. START 82 not 112, footer labels 44 not 68,
timer 82 not 100, high-score value 52 not 82. High-score badge is a flat `#67787F` fill, not the
masked 9-slice. Preview insets the width, not the height.

**And the footer is a `HorizontalLayoutGroup`** — `extract_ui.py` does not report layout groups, so
the dump shows all five controls at `pos (0,0)`. That is the fourth time the scene YAML had to be read
directly (ADR-015, 016, 017, 019). **Check the scene, always.**

`justify-content: space-evenly` approximates the layout group's force-expand: measured 66.8 ref px
between controls where Unity's maths predicts 70. Close, not exact — needs a capture.

## 2g. What the rest of Phase 6 delivered

| File | Contents |
|---|---|
| `src/layout/crop-landscape.ts` | Landscape ImageSelect + Crop geometry |
| `src/layout/browse-landscape.ts` | Landscape Browse geometry |
| `src/layout/win-landscape.ts` | Landscape Win geometry |
| `src/layout/screens.ts` | Per-screen orientation selection + an explicit interface per screen |
| `src/layout/rect.ts` | New `verticalBand` idiom; `textStyle` now emits `text-transform` |
| `src/layout/crop.ts` | `CROP_SHARED` — the crop-grid tunables, corrected to the scene values |
| `src/layout/browse.ts` | `CARD_GRID`, `DROPDOWN_POPUP`, `CARD_INTERNALS` — shared by both orientations |

All four screen components now read `X_LAYOUT[ORIENTATION]` instead of importing `*_PORTRAIT`.
Measured figures for every screen: [roadmap.md](roadmap.md) Phase 6.

### The two things that were not "same shape, different numbers" (ADR-021)

1. **The instruction line changes parent** — panel/stage in portrait, the SCREEN in landscape. The
   table carries `descriptionParent` and the component honours it.
2. **Landscape Browse needed a new rect idiom.** `ClearSearchBtn`, `SearchButton`, `PrevButton` and
   `NextButton` are anchored to a vertical edge with the Y stretched *and* a `sizeDelta` on the
   stretched axis. `verticalBand` handles it; the portrait table pre-resolved the same rects to point
   rects, so the two tables express one scene idiom two ways (noted in both headers).

### Four defects the verification found — all of which also affected PORTRAIT

| # | Was | Ships | ADR |
|---|---|---|---|
| F1 | crop handles 80 px @ 0.9, min 0.2 | **50 px opaque, min 0.5** | 022 |
| F2 | grid gap 24, no padding, non-square cards | **gap 16, padding (16,16,16,40), square** | 022 |
| F3 | every button label uppercased | **only `m_fontStyle & 16` ones** — not "Play Again?" | 022 |
| F4 | Puzzle screen revoked the cropped blob | **`App` owns and revokes it** | 023 |

**F4 is the one to remember: the board was rendering completely BLACK after a crop, and every DOM
assertion passed.** A screenshot found it. F1 is the *fifth* time the scene overrode a C# initialiser
(ADR-015); F2 is the inverse — `CardGrid` has no `GridLayoutGroup` in either scene, so the runtime code
is the source of truth. Ask which source the running build reads before trusting either.

---

## 8. Recommended next task

**Close out Phase 6.** All geometry is done in both orientations; what is left is hardware and
packaging.

1. **Auto-start on boot + crash auto-restart (P6.11 / B6)** — **DONE (ADR-024, `scripts/kiosk/`).**
   Remaining work is on-hardware: register the task with `install-autostart.ps1` (elevated), set the
   kiosk to auto-login, and add a health signal so a renderer-crash-with-live-host or a hang is caught
   too (only process-death is handled now).
2. **Performance and soak** — 60 fps during tile animation at 4K, memory stable across 100+ rebuilds,
   24 h run. All need the real kiosk. Tiles already animate with `transform` only, and blob URLs now
   have exactly one owner each (ADR-023), which is what a memory soak would have caught.
3. **Code signing (B5)** — procurement, so worth starting early. **Two** artefacts to sign (ADR-020).
4. **The pixel diff (§10)** — needs an interactive shell, nothing else.
5. **Card internal geometry (P3.12)** — still unverified without the prefab. The card is now known to
   be square (its Unity cell is), but the title/artist/accession sizes inside it are not confirmed.

**Also outstanding:** `PerPageDD` (P3.11 — option list is in neither the scene nor the docs), a real
phone-upload test (P4.11), and the kiosk-hardware install (P6.10). The installer is unsigned, so
SmartScreen warns on first run.

**And still, independently of all of it: rotate the API key and the OAuth `client_secret`.** Both are
in the Unity repository's git history.

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
- **Driving the app in a browser, the recipe that worked (2026-07-30).** No `initScript` was available,
  and it turns out none is needed: `isTauri()` is evaluated per call, so installing
  `window.__TAURI_INTERNALS__ = { invoke }` **after** load is enough — the first Browse fetch then goes
  through the stub, and if it already failed, typing in the search field and pressing Enter refetches.
  Point each fixture's `primary_image` at a bundled asset (e.g. `/assets/fallback/fallback-01.png`) and
  the whole Browse → Crop → Puzzle chain works offline.
  Three traps in that environment: **(a)** the scale factor is computed from `window.innerWidth`, and
  while the pane is not composited that reads 0, so the canvas renders at `scale(0)` — resize the
  window once *after* load to force a recompute; **(b)** `window.dispatchEvent` from the tool's
  isolated world does not reach the app's listeners, but `dispatchEvent` on a DOM node does, so tap a
  button with `pointerdown` + `pointerup` on the element itself; **(c)** screenshots only work while the
  pane is actually displayed.
- **Solving the board from the outside** (to reach the win screen): read each tile's
  `background-position` for its correct cell and its `translate3d` for its current cell, BFS over the
  9!/2 states, then tap the tiles in order with ~200 ms between taps. 12–17 moves is typical.
- **Never round-trip a source file through PowerShell `Get-Content -Raw` / `Set-Content`.** In 5.1 a
  file without a BOM is read as ANSI, so UTF-8 punctuation is mangled and written back
  double-encoded. Use the editing tools instead. This corrupted `layout/portrait.ts` once and had to
  be repaired with Python.
- **Batch files must use CRLF.** `cmd.exe` mis-parses an LF-only `.bat` and reports
  `'build.bat' is not recognized as an internal or external command` even though the file exists in
  the current directory. `.gitattributes` now pins `*.bat`/`*.cmd`/`*.ps1` to CRLF; if you create a
  batch file with a tool that writes LF, convert it.
- **`copy-assets.ps1` no longer hard-fails without Unity (B8, 2026-07-30).** The `predev`/`prebuild`
  hooks run it on every dev/build, and it used to `throw` (and `Join-Path`-crash on the absent `D:`
  drive) when the Unity project was missing — which blocked *everything* on a Unity-less checkout even
  though `public/assets` was already populated. It now skips with exit 0 when the assets are present
  (`NAME_MAP.md` as the sentinel) and still fails loudly on a genuinely empty checkout. This is what
  makes the README "copy the three artefacts instead of bringing Unity" path actually build.
- **Artwork images go through Rust and cache to app data (ADR-025).** `image_fetch`
  caches to `%LOCALAPPDATA%\<identifier>\image-cache\<hash>.<ext>` — disk hit skips
  the network. Grid previews (ImageKit **w600**) and full masters are both cached.
  Two live-API-only defects were fixed here: the master host `static.cumulus.co.in`
  was not allow-listed, and an **unquoted** `MAP_OAUTH_SCOPE` in a hand-edited
  `.env` dropped the scope (token 1263 vs 1306) so the collection 403'd — quote it
  (ADR-016 trap again). No cache eviction yet (P6.12).
- **Kiosk auto-start lives in `scripts/kiosk/` (ADR-024), PowerShell only** — the kiosk has no Node or
  Pester. `KioskPolicy.ps1` is the pure, Pester-tested core (`npm run test:watchdog`, kept OUT of
  `npm test`); `kiosk-watchdog.ps1` is the supervisor loop (`-DryRun`, `-MaxIterations`, stub-exe
  friendly); `install-autostart.ps1` / `uninstall-autostart.ps1` register/remove the logon task
  (`-DryRun`, need elevation). The watchdog relaunches on a crash and STOPS on a clean exit (code 0 =
  staff double-Esc), so staff keep a way out.

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

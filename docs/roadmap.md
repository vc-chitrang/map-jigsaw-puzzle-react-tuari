# Roadmap — Unity → React + Tauri port

Phased so each phase ends with something runnable and verifiable.

---

## Phase 0 — Decisions & scaffold  ✅ *complete except the Unity-capture diff*

**Goal:** an empty Tauri window that scales like Unity's canvas.

- [x] Confirm the open technology decisions in [architecture.md §3](architecture.md#3-technology-decisions-to-make-before-coding); recorded as ADR-009 … ADR-013 in [decisions.md](decisions.md).
- [x] **Conduit ITC** Regular + Bold converted to `woff2` from the Unity sources (ADR-013).
- [x] Scaffold Tauri v2 + React 18 + TypeScript + Vite.
- [x] Implement `ScaledCanvas` + `useScaleFactor` (geometric-mean formula) — `src/canvas/`.
- [x] Kiosk window config: fullscreen, undecorated, always-on-top, no context menu/selection/zoom
      (ADR-012 — applied at runtime so `tauri dev` stays usable).
- [x] Staff exit hatch (double-Esc within 1 s), installed before React renders.
- [x] Asset copy + font + icon + pixel-diff + API-config scripts.

**Exit criteria:** a 2160×3840 reference rectangle renders identically at 1080p / 1440p / 4K, and
a placeholder box lands within 1 px of the Unity capture.

**Result — measured, not eyeballed:**

| Viewport | scaleFactor (expected = actual) | Canvas device size | Max geometry error |
|---|---|---|---|
| 1080 × 1920 | 0.5 | 1080 × 1920 | **0 px** |
| 1440 × 2560 | 0.666667 | 1440 × 2560 | **0 px** |
| 2160 × 3840 | 1.0 | 2160 × 3840 | **0 px** |
| 3840 × 2160 (mismatched aspect) | 1.0 | centred, clipped vertically, not scrollable | relative positions identical to every other size |

`BackButton` (Idiom B: anchor `(0,0.5)`, pos `(40,60)`, size 124², pivot `(0,0.5)`) lands at
exactly `(40, 1798, 124, 124)` reference px. `StartPuzzleButton` (Idiom A: fractional anchors)
lands within 0.014 px of the hand-computed value — that residual is the rounding in the
hand-computed expectation, not in the implementation.

**Still open:** the *Unity-capture* half of the exit criterion. See task D7 — a true 2160×3840
capture needs 4K portrait hardware, since a window cannot exceed the physical display. The
workaround (capture both builds at the same smaller size) is valid because the scale factor is
uniform, but it has not been run yet.

---

## Phase 1 — Game core (pure TypeScript, no UI)  ✅ *complete*

**Goal:** the puzzle rules, fully unit-tested, headless.

- [x] `game/board.ts` — grid model, cell positions, board sizing maths.
- [x] `game/shuffle.ts` — move-based shuffle (27 moves for 3×3, no immediate reversal, bounded retry).
- [x] `game/moves.ts` — adjacency, move execution, win detection, arrow placement.
- [x] `game/highScore.ts` — per-artwork key, write-if-faster, `--:--` for unset.
- [x] `game/timer.ts` + `game/reducer.ts` — timer starts on the first player move only.
- [x] Unit tests for every logic item in [game-logic.md §12](game-logic.md#12-port-checklist--logic-parity-tests).

**Exit criteria:** all parity tests green; 10,000 random shuffles are always solvable and never
start solved.

**Result:** **117 tests green.** 10,000 seeded shuffles produced **0 unsolvable** boards and
**0** that started solved. Solvability is checked by an *independent* inversion-parity test rather
than by restating the shuffle's own invariant, so "solvable by construction" is verified from the
other direction.

Notes on the implementation:

* `src/game/` imports nothing from React, the DOM, or any browser global — the high-score module
  takes an injected `KeyValueStore`, and the RNG is injectable so a failing shuffle is reproducible
  from its seed.
* A move is **two** reducer actions, `MOVE_STARTED` → `MOVE_SETTLED`, mirroring Unity's
  `MoveTileRoutine`: the grid updates and the timer starts *before* the 140 ms tween, while the move
  count and win check happen *after* it. Collapsing them would reveal the 9th slice while the last
  tile was still sliding.
* Attract-mode moves deliberately never check for a win, so a chance solve during auto-shuffle
  cannot trigger the win screen.
* Four §12 items are not Phase 1 work and remain open: the API abort guard (Phase 3), QR screen
  gating (Phase 4), and the transition-overlay invariant (Phase 5).

---

## Phase 2 — Puzzle screen (the money screen)  🟡 *built and playable; pixel diff outstanding*

**Goal:** pixel-perfect primary screen, playable.

- [x] Board rendering (9 tiles, background-position slicing, outline, empty slot).
- [x] Tile slide animation — 140 ms `OutCubic`, `translate3d`.
- [x] Arrows — placement maths, **0.35** cell size (ADR-015), pulse 1→1.06 / 250 ms / alternate / infinite.
- [x] Footer: START ⇄ Timer swap, high score badge, Reset / Preview / New Image.
- [x] `SpriteButton` — SpriteSwap sprites, `(−10,−10)` press offset on label+icon, disabled alpha 0.3.
- [x] Artwork title (10 px above board, brand `#FFA300`).
- [x] Attract mode: auto-shuffle 1 move/sec.
- [x] Preview overlay (`#000000` @ 0.86) — **hold-to-show**, sized to the board.
- [x] Geometry table `src/layout/portrait.ts` + `rectStyle` conversion, with 27 tests.

**Exit criteria:** pixel diff vs Unity capture **< 1 %**, differences only in text antialiasing.

**Status: not yet measured.** Everything above is implemented and verified behaviourally in a real
browser at 1080×1920:

* Board lands at `(319.68, 645.68)`, 1520.64 px square — centred horizontally, 514 px above centre.
* Press offset measured as `matrix(1, 0, 0, 1, -10, 10)` — Unity `(−10,−10)` with the Y flip.
* Preview overlay matches the board rect exactly, backdrop `rgba(0,0,0,0.86)`, `object-fit: contain`.
* Attract → gameplay swaps START for a running timer and enables the footer at full opacity.

**Blocked on the capture, not the code.** Both displays on this machine are 1920×**1080**, so a
1080×1920 window does not fit and Windows clips it. Options, in preference order:

1. Capture both builds at **540×960** (fits; parity is scale-invariant, so geometry still verifies —
   text antialiasing differences just count for proportionally more).
2. Run the capture on a machine with a portrait or ≥1920-tall display.

Three findings that came out of building this screen and are worth carrying forward:

* **ADR-015** — four constants in `game-logic.md §11` were C# initialisers, not the shipped scene
  values. Corrected.
* **TMP `m_margin`** is load-bearing: `RESET` carries a 90 px left margin (preview 122, new image 110)
  that shifts each label clear of its icon. Without it label and icon overlap.
* **Preview is hold-to-show**, not a toggle (`UIPressHandler`), and `MatchPreviewToBoard` resizes the
  panel to the board rect at runtime — so the scene's full-stretch authoring never ships.

---

## Phase 3 — API + collection browsing  ✅ *complete*

- [x] Rust `collection_fetch` command (API base URL + key **server-side only**).
- [x] **OAuth login + token cache in Rust** — not in the original plan; the endpoint 500s without a
      bearer token (ADR-016).
- [x] TS client with a request-id guard; `api/types.ts` from the documented shape.
- [x] Browse screen: search, 5 filter dropdowns (searchable), sort, pagination, result count.
- [x] Responsive card grid (`auto-fill minmax(320px, 1fr)`, square cards, min 2 columns).
- [x] Card image loading: 600 px ImageKit thumbnails, lazy, spinner, graceful failure.
- [x] Offline/error handling: empty state, retry, and a silent fall back to bundled artwork.
- [x] `image_fetch` command with a host allow-list, so the board can crop cross-origin artwork.

**Exit criteria:** filter + search + paginate with fast input produces no stale renders.

**Verified against the LIVE API:**

* Login succeeds; token 1,306 chars, `expires_in` 2,592,000 s (30 days).
* Collection returns HTTP 200 with the documented shape: `total` **32,305**, `last_page` 10,769.
* Filter option counts: department 6, classification 339, artist **2,022**, culture 1,789, date 741.
* App boots clean — config loaded, login OK, no warnings.

**Verified in the UI** (Browse driven through a stubbed IPC at 540×960): result count renders
`1 to 12 of total 32305 results` — the exact Unity string; pagination reads `Page 1 of 10769`; all
five dropdowns present with the scene's labels; the sort control offers exactly the five Unity
labels; the grid resolves to 4 columns, which is what `targetCellSize = 320` with a 24 px gap gives
at this container width.

**Stale-response guard:** `AbortController` cannot cancel a Tauri `invoke`, so the request-id counter
(Unity's `_fetchId`) is what provides the guarantee, and `useCollection` ignores
`StaleResponseError` entirely. A signal is still accepted so an unmounting caller can drop its result.

**Not done, deliberately:**

* `PerPageDD` — active in the scene, but its option list is in neither the scene nor the docs, so it
  was not guessed. `limit` stays at the documented 40.
* Card *internal* geometry is unverified: the card prefab is not in the repository. See the header
  note in `src/layout/browse.ts`.
* Navigation is still the interim state switch in `App.tsx`; the fail-safe router is Phase 5.

---

## Phase 4 — Crop + QR upload  ✅ *complete*

- [x] Crop screen — **a resizable square grid, not pan/pinch-zoom** (ADR-017), rotate ±90° over
      300 ms linear with the pixel rotation committed after, square export at source resolution.
- [x] ~~Zoom slider + reset~~ — **does not ship**: those objects are under an inactive parent in the
      scene (ADR-017).
- [x] `socket.io-client` `new-upload` listener (`transports: ['polling']`), gated to ImageSelect/Crop.
- [x] QR code display, dimmed with an explicit notice when the upload socket is down.
- [x] Replace-in-place when a second upload arrives while cropping.
- [x] **ImageSelectOrUploadScreen** — was not listed here, but the QR lives on it and the flow needs
      it between START and Browse.

**Exit criteria:** phone upload → crop → playable board, and a second scan mid-crop swaps the image.

**Verified in the browser at 540×960** (Tauri IPC stubbed, a real 4:3 test image through
`image_fetch`):

* Full flow walks Puzzle → ImageSelect → Browse → Crop → Puzzle.
* Crop stage is square (1520.64 reference px); the 4:3 image letterboxes to 1520.64 × 1140.5 and the
  grid initialises as the largest square (1140.5), centred — matching `gridBounds` exactly.
* Corner drag: grid **shrank 286.5 → 229.9** device px, stayed square, and the opposite corner did
  not move. Body drag moves it without changing its size.
* Rotate: the tween runs, then settles, and the grid re-initialises to the new fit.
* Export → board: 8 tiles, each slicing the cropped blob at
  `background-size: 1508.64px` = cellSize (502.88) × 3 — the exact expected value.
* A cropped image goes **straight into gameplay**: START is gone and the timer is visible.

**Three bugs found and fixed while verifying:**

1. `setPointerCapture` throwing aborted the whole drag. It is now best-effort, so a capture failure
   degrades to an un-captured drag instead of a dead handle.
2. `width: auto` on a replaced element takes the **intrinsic** size and ignores the right/bottom
   insets — a 512 px rotate sprite rendered at 512 px inside a 120 px button. Same latent bug fixed on
   the QR image (1024 px sprite in a 682 px panel).
3. `extractImageUrl` recursed without a depth bound. Now capped at 4.

**Still interim:** navigation is the state switch in `App.tsx`. Back rules are honoured
(Crop → Browse when it came from Browse, else → ImageSelect) but there is no cross-fade and no back
stack — Phase 5.

---

## Phase 5 — Win screen, navigation, keyboard  ✅ *complete*

- [x] Win screen: best time, your time, Play Again (straight into gameplay). An **overlay** on the
      Puzzle screen, not a routed screen — its scene background is alpha 0 (ADR-018).
- [x] 1 s delay + reveal of the 9th slice — already in the reducer since Phase 1; wired here.
- [x] `ScreenRouter` with the custom back rules and the cross-fade (200 ms ×2, timeout fallback).
- [x] In-app on-screen keyboard (white, brand-styled) wired to the search field **and all five
      filter popups**.
- [x] Tap-outside-to-dismiss (< 15 px = tap, ignore drags, ignore taps on inputs).

**Exit criteria:** full loop playable end-to-end; no transition can leave a click-blocking overlay.

**Verified — the transition invariant.** Measured live at 540×960 by reading the overlay's computed
style through a full cross-fade:

| Phase | `pointer-events` | opacity |
|---|---|---|
| `idle` (before) | `none` | 0 |
| `fadingOut` | `auto` | 0.68 mid-fade |
| `fadingIn` | `auto` | 0.88 mid-fade |
| `idle` (after) | `none` | 0 |

Plus 23 unit tests on the pure reducer, including an **exhaustive walk of the action space to depth
4** asserting that `phase === 'idle'` always implies `pointer-events: none`, and confirming the walk
actually reached all three phases so the assertion is not vacuous. `FORCE_IDLE` is proven to land on
`idle` from every phase.

**Verified — the win path, end to end.** The board was solved for real: board state was read out of
the DOM (tile transforms and background-positions), BFS found a **17-move** solution, and the moves
were played through the normal tap path. Result: board solved, 9th slice revealed, win screen shown,
`Your Score 00:03`, `High Score 00:03` (first record written), Play Again present. Play Again then
produced a new board straight into **gameplay** — START hidden, footer live, timer running.

**Verified — the keyboard.** 41 keys, 469.7 device px wide at 540×960 so it fits the canvas. Shift
latches, uppercases exactly one character, then clears (`ragm` → shift → `M` → `m` → `ragmMm`).
Backspace, space and Search all correct; Search commits the query and closes the keyboard.

**Verified — the 15 px dismiss rule**, all four cases: an 80 px drag leaves the keyboard open; a 3 px
tap closes it; 13.5 px diagonally still counts as a tap; **15.6 px diagonally counts as a drag**, so
the rule is measured diagonally rather than per-axis.

**Three bugs found and fixed while verifying:**

1. **The win screen was invisible.** Nested inside the Puzzle screen it sat under the preview panel's
   `z-index: 10`. Caught by a screenshot — the DOM assertion passed the whole time because
   `innerText` contained "You Win!" (ADR-018).
2. **Home mid-game did nothing** when no cropped artwork was pending. Clearing `preparedArtwork` was
   the only reset signal, and clearing an already-null value changes no dependency. Added an explicit
   `resetToken`.
3. **Fast typing lost characters.** The keyboard took the current value as a prop, so four presses in
   one React batch all read the same stale string and "raga" arrived as "a". The keyboard no longer
   knows the text at all — `onChange` takes an updater.

**Not done:** `PerPageDD` (P3.11), card internal geometry (P3.12), a real phone-upload test (P4.11),
and the pixel diff (needs an interactive shell).

---

## Phase 6 — Landscape, polish, packaging  🟡 *all five screens land in landscape; perf/soak outstanding*

- [x] Landscape geometry table for the **Puzzle screen** — `src/layout/landscape.ts`, transcribed from
      `docs/ui/scene-landscape.md` with layout-group and TMP details read from the scene YAML.
- [x] Landscape tables for **ImageSelect, Browse, Crop and Win** — `crop-landscape.ts`,
      `browse-landscape.ts`, `win-landscape.ts`, selected per screen by `layout/screens.ts` (ADR-021).
- [x] Brand pass: the ambers were resolved in ADR-013; chrome neutrals are now tokens too.
- [ ] Performance: 60 fps during tile animation at 4K; memory stable across 100+ rebuilds.
- [ ] Soak test: 24 h.
- [x] Build `.exe`/installer — working since Phase 2 (`build.bat`). **Not yet tested on kiosk hardware.**
- [x] Auto-start on boot + crash auto-restart — logon Scheduled Task drives an external watchdog
      (`scripts/kiosk/`, ADR-024). Pure restart policy, 16 Pester tests (`npm run test:watchdog`).
      Registering the task and the kiosk auto-login are on-hardware steps (P6.10); a renderer-crash
      with a live host process, and a hang, are not yet caught (need a health signal + the machine).

**Exit criteria:** signed installer runs on kiosk hardware, survives a 24 h soak.

**Landscape — verified at 960×540** (a 16:9 window, so scale 0.25 of the 3840×2160 reference):

| Check | Measured | Expected |
|---|---|---|
| canvas | 3840 × 2160 | reference size |
| scaleFactor | 0.250000 | `sqrt((960/3840)×(540/2160))` |
| board | 367.2² device = 1468.8 ref | `min(3840,2160) × 0.68` |
| board centre | (480, 980) ref-adjusted | centred, 100 px above centre |
| footer row | 5 children: 290,224,290,290,290 ref | scene sizes |
| gap between controls | 66.8 ref | ~70 ref by Unity's maths |

**Portrait re-checked for regression after the refactor**: canvas 2160×3840, home button 31 device
= 124 ref (portrait's size, not landscape's 72), board 1520.8 ref, and the landscape flex row is
absent from the DOM. No regression.

**Landscape is not portrait rearranged** — see ADR-019. Different back-button size, logo corner, every
font size, and a flat high-score fill instead of the masked 9-slice. The footer uses a
`HorizontalLayoutGroup`, which `extract_ui.py` does not report, so the dump alone would have stacked
all five controls at `pos (0,0)`.

**Brand pass status.** The amber conflict was settled in ADR-013 and the tokens carry it. Chrome
neutrals (input borders, keyboard keys, dividers) are now `--chrome-*` tokens. Colours in
`src/layout/*.ts` stay literal **on purpose**: they are transcribed scene data, and inlining them is
what keeps those tables diffable against the dumps. Two card placeholder shades (`#111111`,
`#1a1a1a`) are still literal — cosmetic, in the image-failure state only.

**Packaging** is settled: two installers, ADR-020.

### The other four screens in landscape — measured at 960×540 (scale 0.25)

Driven through a stubbed Tauri IPC, reading `getBoundingClientRect` back through the canvas scale.
Every figure below is the measurement, and every one matches the scene value it was transcribed from.

| Screen | Check | Measured (ref px) | Expected from the scene |
|---|---|---|---|
| ImageSelect | panel | 2319.0 × 1490.8 at (759.5, 259.4) | 0.1978-0.8017 / 0.1897-0.8799 |
| ImageSelect | description | full width, h 92, y 98, font 48 | screen-parented, `pos.y −98` |
| ImageSelect | collection button | 637.9 × 642.9 at (900.1, 717.4) | 0.0606-0.3357 / 0.2615-0.6928 of the panel |
| ImageSelect | QR panel + code | 640² panel, code 740² (+100 overhang) | `sizeDelta (100,100)` |
| ImageSelect | divider | 1 × 78, 32 px below panel centre | `pos (0, −32)`, `size (1, 78)` |
| Crop | stage | 1468.8² at (1185.8, 245.6) | square, = board size (min × 0.68) |
| Crop | description | h 38, y 125.6, font 48 | screen-parented, `pos.y −125.6006` |
| Crop | rotate buttons | 80² at x 1800.2 / 1960.2, y 1744.4 | ±80, `pos.y −110` below the stage |
| Crop | START | 315 × 121 at (1762.5, 1939), label 82 | point rect, 100 px above the bottom |
| Crop | handles | 4 × 50 px, `rgb(255,255,255)` | serialized `CropGridResizer` (ADR-022) |
| Browse | search bar | 2751.7 × 60.5 at (479.2, 242.6) | 0.1248-0.8414 / 0.8597-0.8877 |
| Browse | search button | 70 wide, full height, outside the right edge | `verticalBand`, pivot (0, 0.5) |
| Browse | filter title / Clear | 24.5 px at y 317.5 / 300 × 54, 23 px | `pos.y 48.4` / `pos.y 0` |
| Browse | dropdowns | 5 × 534.2 × 56.3, stride 570.2, filling the bar | spacing 36 (same group as portrait) |
| Browse | page arrows | 75 × **349.8** at y 900.1 | `sizeDelta (75, −870)` → 1219.75 − 870 |
| Browse | grid | 7 columns, gap 16, padding 16/16/40, cards 362.4² | `UpdateGridCellSize` + `SetupGridLayout` |
| Win | popup | 1266.4 × 1013 at (1286.8, 473.5), topmost | 0.3351-0.6649 / 0.3118-0.7808 |
| Win | banner / boxes | 400 × 120; 320 × 104 at ±100 from centre | scene sizes |
| Win | Play Again | 475 × 120 at (1682.5, 1266.5), label 68 | `size (475.04, 120)`, `pos.y 100` |

The win screen was reached by **solving the board for real**: board state was read out of the DOM
(tile transforms + `background-position`), BFS found a 12-move solution, and the moves were played
through the normal tap path. `Your Score 00:03`, high score written, popup confirmed topmost — the
ADR-018 z-order trap does not recur in landscape.

**Portrait re-checked at 540×960 after the refactor:** board 1520.6² at (319.7, 645.7) — identical to
the Phase 2 figures; ImageSelect panel 1831.7 × 2379.3 at (168, 804.9) with the description still
inside it; crop stage 1520.6², description still above the stage; Browse 4 columns, cards 381.2²;
footer labels still uppercase. No regression.

### Four parity defects found while verifying (all portrait too)

Fixed, and tracked as F1-F4 in [tasks.md](tasks.md): crop handles from the scene not the C#
initialisers (ADR-022), card grid spacing/padding and square cells (ADR-022), per-label casing from
TMP `m_fontStyle` (ADR-022), and the cropped blob URL's ownership — which had the board rendering
**completely black** after a crop (ADR-023).

**308 tests** green (was 276): +30 for the four landscape tables and the `verticalBand` idiom, +2 for
the casing rule.

---

## Explicitly out of scope

- `QRScanScreen` and `Artwork Focus Screen` — deprecated (`[X]`) in the Unity build.
- Grid sizes other than 3×3 (code supports 4×3/3×4/4×4 but the kiosk is fixed at 3×3).
- Multi-language / localisation (not present today).
- Login UI — login is a headless boot step, not a screen.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Font licensing for web formats | Blocks pixel parity | Resolve in Phase 0 before UI work |
| Text metric differences (SDF vs browser) | Small visual deltas | Flex centring, real Bold face, accept AA-only diffs |
| API key exposure in renderer | Security | Rust-side proxy from Phase 3 |
| Kiosk lockdown gaps (visitor escapes the app) | Operational | Phase 0 kiosk config + staff exit hatch |
| 4K performance in a webview | Jank | `transform`-only animation, avoid layout thrash, test on real hardware early |

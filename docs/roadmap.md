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

## Phase 5 — Win screen, navigation, keyboard

- [ ] Win screen: best time, your time, Play Again (straight into gameplay).
- [ ] 1 s delay + reveal of the 9th slice before the win screen.
- [ ] `ScreenRouter` with the custom back rules and the cross-fade (200 ms ×2, with timeout fallback).
- [ ] **In-app on-screen keyboard** (white, brand-styled) wired to the search field.
- [ ] Tap-outside-to-dismiss rule (< 15 px = tap, ignore drags, ignore taps on inputs).

**Exit criteria:** full loop playable end-to-end; no transition can leave a click-blocking overlay.

---

## Phase 6 — Landscape, polish, packaging

- [ ] Landscape geometry table; verify both orientations against captures.
- [ ] Brand pass: replace `#E7B639`/`#DCB63C` with `#FFA300`; all colours as CSS custom properties.
- [ ] Performance: 60 fps during tile animation; memory stable across 100+ rebuilds.
- [ ] Soak test: run 24 h, confirm no leak/drift (the Unity build had explicit texture cleanup for this).
- [ ] Build MSI/`.exe`; test on the actual kiosk hardware and display.
- [ ] Auto-start on boot + crash auto-restart.

**Exit criteria:** signed installer runs on kiosk hardware, survives a 24 h soak.

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

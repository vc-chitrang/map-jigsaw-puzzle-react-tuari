# Tasks

Live task list. Update as work proceeds (per [AGENTS.md](../AGENTS.md)).

Status: `TODO` · `WIP` · `DONE` · `BLOCKED`

---

## Documentation (port groundwork)

| # | Task | Status | Notes |
|---|---|---|---|
| D1 | Extract game logic, algorithms & API contract | **DONE** | [game-logic.md](game-logic.md) |
| D2 | Extract UI screens, element geometry, animations | **DONE** | [ui-spec.md](ui-spec.md) |
| D3 | Generate exhaustive per-element scene dumps | **DONE** | [ui/scene-portrait.md](ui/scene-portrait.md), [ui/scene-landscape.md](ui/scene-landscape.md) via [tools/extract_ui.py](tools/extract_ui.py) |
| D4 | Pixel-perfect replication contract | **DONE** | [pixel-perfect-replication.md](pixel-perfect-replication.md) |
| D5 | Architecture (current + target) | **DONE** | [architecture.md](architecture.md) |
| D6 | Roadmap | **DONE** | [roadmap.md](roadmap.md) |
| D7 | Capture reference screenshots of every Unity screen | **TODO** | **Client chose 540×960** as the parity capture size (2026-07-29) — it fits the local 1920×1080 displays, and the scale factor is uniform so geometry parity verified at one size holds at every size. Report the capture size with any diff number, since text antialiasing counts for proportionally more at this size. Command: `"MAP Jigsaw Puzzle-0.1.2-2.exe" -screen-width 540 -screen-height 960 -screen-fullscreen 0`, capture the port at the same size with `VITE_HIDE_VERSION=1`, then `npm run diff:pixels` |
| D8 | Document 9-slice border values for `Circle_9Sliced.png` | **DONE** | Uniform 255 px → `border-image-slice: 255 fill`, recorded in [asset-manifest.md §3](asset-manifest.md). Tint `#67797F` cannot be applied via `border-image` — needs a pre-tinted PNG or a mask overlay |
| D9 | Export UI sprite set + `woff2` fonts | **DONE** | 44 sprites via `npm run copy:assets` (0 missing); Conduit ITC Bold 21.1 KB + Regular 23.6 KB via `npm run build:fonts` |

## Open questions to resolve with the client / designer

| # | Question | Status |
|---|---|---|
| Q1 | Artwork title colour: code says `#DCB63C`, comment + brand guide say `#FFA300` | **RESOLVED** — brand `#FFA300`. See ADR-013 |
| Q2 | Caption colour `#E7B639` — align to brand `#FFA300`? | **RESOLVED** — yes, `#FFA300`. See ADR-013 |
| Q3 | `#67797F` (high-score badge) isn't in the brand palette — keep or replace? | **RESOLVED** — kept; the palette has no neutral grey. See ADR-013 |
| Q4 | Conduit ITC or Geometria/Leitura News? | **RESOLVED** — Conduit ITC Regular + Bold only; licensing is not a port blocker. See ADR-013 |
| Q5 | Is the staff exit gesture still double-Esc? | **RESOLVED** — yes, double-Esc within 1 s |
| Q6 | Portrait first, and is the kiosk display 2160×3840 portrait? | **RESOLVED** — yes to both |
| Q7 | WebView2: bundled or downloaded at install time? | **RESOLVED** — port's call; bundled offline installer. See ADR-011 |

## Phase 0 — scaffold

| # | Task | Status | Notes |
|---|---|---|---|
| P0.1 | Confirm technology decisions → [decisions.md](decisions.md) | **DONE** | ADR-009 … ADR-013 |
| P0.2 | Scaffold Tauri v2 + React 18 + TS + Vite | **DONE** | Rust shell compiles clean; `npm run build` green |
| P0.3 | `ScaledCanvas` + `useScaleFactor` (geometric mean) | **DONE** | `src/canvas/`; 13 unit tests |
| P0.4 | Kiosk window config + browser lockdown | **DONE** | `src-tauri/src/kiosk.rs`, `src/kiosk/lockdown.ts` |
| P0.5 | Staff exit hatch (double-Esc) | **DONE** | `src/kiosk/exitHatch.ts`, installed before React renders |
| P0.6 | Verify reference geometry at 1080p/1440p/4K | **DONE** | 0 px error at 1080×1920, 1440×2560, 2160×3840; relative positions identical at 3840×2160 |
| P0.7 | Asset copy script with filename normalisation | **DONE** | `scripts/copy-assets.ps1` + generated `public/assets/NAME_MAP.md` |
| P0.8 | Font pipeline `.otf`/`.ttf` → `woff2` | **DONE** | `scripts/build-fonts.ps1` |
| P0.9 | App icon pipeline | **DONE** | `scripts/make-icon.ps1` squares the logo on MAP Kohl, then `tauri icon` |
| P0.10 | Pixel-diff harness | **DONE** | `scripts/pixel-diff.mjs` (pixelmatch — ImageMagick is not installed here) |
| P0.11 | API config extraction, no secrets printed | **DONE** | `scripts/extract-api-config.ps1` → gitignored `src-tauri/.env` |
| P0.12 | Diff the port against a real Unity capture | **BLOCKED** | Depends on D7 |

## Phase 1 — game core

| # | Task | Status | Notes |
|---|---|---|---|
| P1.1 | `game/board.ts` — grid + cell/board maths | **DONE** | Plus `constants.ts` (single source for every §11 value) and `types.ts` |
| P1.2 | `game/shuffle.ts` — move-based, bounded retry | **DONE** | Injectable RNG; `pickAutoShuffleMove` for attract mode |
| P1.3 | `game/moves.ts` — adjacency, execute, win check | **DONE** | Includes `arrowPlacements` — no Y negation, guarded by test |
| P1.4 | `game/highScore.ts` — per-artwork persistence | **DONE** | `KeyValueStore` injected, so no browser global in `src/game/` |
| P1.5 | Timer reducer (starts on first player move) | **DONE** | `timer.ts` + `reducer.ts`; two-step move mirrors `MoveTileRoutine` |
| P1.6 | Unit tests for all §12 parity items | **DONE** | **117 tests green**, incl. 10,000-shuffle solvability by independent inversion parity |
| P1.7 | Wire the core into a screen | **DONE** | Phase 2 `PuzzleScreen` drives the reducer |
| P1.8 | Correct the constants to the scene-serialized values | **DONE** | ADR-015. `BOARD_TUNING` per orientation; asserted in `board.test.ts` |

## Phase 2 — Puzzle screen

| # | Task | Status | Notes |
|---|---|---|---|
| P2.1 | Geometry table from the scene dump | **DONE** | `src/layout/portrait.ts` + `rectStyle`/`textStyle` in `src/layout/rect.ts`, 27 tests |
| P2.2 | `SpriteButton` — sprite swap, press offset, disabled alpha | **DONE** | Two press semantics: click (`onPress`) and hold (`onPressStart`/`onPressEnd`, `releaseOnExit`) for Preview |
| P2.3 | Board — outline, 9 tiles, empty slot, 9th-slice reveal | **DONE** | `background-position` slicing; outline overhangs by `tileSpacing` |
| P2.4 | Tile slide 140 ms OutCubic via `translate3d` | **DONE** | Settled by timeout, not `transitionend`, so a dropped event cannot wedge input |
| P2.5 | Arrows — placement, 0.35 cell, 250 ms pulse | **DONE** | Pulse uses the `scale` property so it composes with the positioning `transform` |
| P2.6 | Footer — START ⇄ Timer, high-score badge, 3 buttons | **DONE** | Badge is a 9-sliced `-webkit-mask-box-image` over a solid tint, since `border-image` cannot be tinted |
| P2.7 | Artwork title above the board | **DONE** | Empty for the offline fallback set, which has no titles |
| P2.8 | Attract mode auto-shuffle | **DONE** | 1 move/s; never starts the timer, counts, or checks for a win |
| P2.9 | Preview overlay | **DONE** | Hold-to-show, sized to the board rect (`MatchPreviewToBoard`) |
| P2.10 | TMP `m_margin` on labels | **DONE** | Load-bearing: 90/122/110 px left margins shift labels clear of their icons |
| P2.11 | Pixel diff < 1 % vs Unity capture | **BLOCKED** | Both local displays are 1920×**1080**, so a 1080×1920 window is clipped. Capture both at 540×960, or use a ≥1920-tall display. See D7 |
| P2.12 | Screen navigation from Home / Start | **TODO** | Phase 5 — Home currently reloads a new image |

## Phase 3 — API + collection browsing

| # | Task | Status | Notes |
|---|---|---|---|
| P3.1 | Rust `collection_fetch`, key server-side only | **DONE** | `src-tauri/src/api.rs`; errors are scrubbed of URLs so a key cannot reach a log |
| P3.2 | OAuth login + token cache | **DONE** | ADR-016. Not in the original plan — the endpoint 500s without a bearer token |
| P3.3 | `api/types.ts` from the documented shape | **DONE** | Plus `SORT_MODES` and `formatResultCount`, both transcribed from `CollectionUIManager` |
| P3.4 | TS client with the request-id guard | **DONE** | `AbortController` cannot cancel `invoke`; the id counter is the real guarantee |
| P3.5 | Browse screen: search, 5 searchable filters, sort, pagination, count | **DONE** | Geometry in `src/layout/browse.ts` from the scene dump |
| P3.6 | Responsive card grid | **DONE** | `auto-fill minmax(320px, 1fr)`, square cards; resolves to 4 columns at the portrait width |
| P3.7 | Card image loading | **DONE** | 600 px ImageKit thumbnails (`CardItemUI.BuildPlaceholderUrl`), lazy, spinner, graceful failure |
| P3.8 | Offline / error handling | **DONE** | Empty state + retry; the Puzzle screen silently falls back to bundled artwork |
| P3.9 | `image_fetch` for cross-origin cropping | **DONE** | Host allow-list, so the command is not an open proxy |
| P3.10 | Puzzle screen plays real collection artwork | **DONE** | `loadRandomArtwork` — collection first, bundled set on any failure |
| P3.11 | `PerPageDD` (results-per-page dropdown) | **TODO** | Active in the scene but its option list is undocumented; not guessed. `limit` stays 40 |
| P3.12 | Verify card internal geometry | **BLOCKED** | The card prefab is not in the repo — needs the prefab or a Unity screenshot |
| P3.13 | `check-api.ps1` connectivity probe | **DONE** | Login + fetch, reporting status and shape while printing no URL, key or token |

## Phase 4 — Crop + QR upload

| # | Task | Status | Notes |
|---|---|---|---|
| P4.1 | Crop screen with the square grid + corner handles | **DONE** | ADR-017 — NOT pan/pinch-zoom; the docs were wrong. Maths in `src/image/cropGrid.ts`, 40 tests |
| P4.2 | Rotate ±90°, 300 ms linear, pixel rotation committed after | **DONE** | The board slices with `background-position` and cannot carry a rotation |
| P4.3 | Square export at source resolution | **DONE** | `src/image/exportCrop.ts` |
| P4.4 | Zoom slider + reset button | **N/A** | Under the inactive `[X]DisableButtons` parent — does not ship (ADR-017) |
| P4.5 | `socket.io-client` `new-upload`, polling transport | **DONE** | `src/api/socket.ts`; URL comes from the Rust `public_config` |
| P4.6 | Upload gated to ImageSelect/Crop only | **DONE** | Read through a ref so navigation does not re-subscribe and drop an upload |
| P4.7 | QR code display | **DONE** | Static bundled sprite; dimmed with an explicit notice when the socket is down |
| P4.8 | Replace-in-place on a second upload while cropping | **DONE** | The previous blob URL is revoked on replacement |
| P4.9 | ImageSelectOrUploadScreen | **DONE** | Not in the original Phase 4 list, but the QR lives on it |
| P4.10 | End-to-end verification | **DONE** | Full flow walked at 540×960; measurements in [roadmap.md](roadmap.md) |
| P4.11 | Verify against a real phone upload | **TODO** | Needs the phone-side upload page and a device on the same network — cannot be exercised here |

## Phase 5 — Win screen, router, keyboard

| # | Task | Status | Notes |
|---|---|---|---|
| P5.1 | `ScreenRouter` with the fail-safe cross-fade | **DONE** | `navigation/router.ts` (pure) + `ScreenRouter.tsx`. 23 tests incl. an exhaustive phase walk of the invariant |
| P5.2 | `pointer-events` derived in exactly one place | **DONE** | `overlayPointerEvents`; verified live across all phases |
| P5.3 | Timeout fallback so a dropped event cannot wedge the UI | **DONE** | Primary timer advances the phase; a second timer forces `idle` and logs a warning |
| P5.4 | Custom back rules | **DONE** | `resolveBack`, transcribed from game-logic §6.3; quit only from Puzzle in attract mode |
| P5.5 | Win screen | **DONE** | Overlay on the Puzzle screen, not a routed screen — ADR-018. Needs `z-index: 20` to clear the preview |
| P5.6 | Play Again → new image straight into gameplay | **DONE** | Verified: START hidden, footer live, timer running |
| P5.7 | In-app on-screen keyboard | **DONE** | `ui/keyboard/`; 27 tests. `onChange` takes an updater so fast typing cannot lose characters |
| P5.8 | Keyboard wired to the 5 filter popups | **DONE** | Popup search text lifted into `BrowseScreen` so one keyboard serves all six fields |
| P5.9 | Tap-outside-to-dismiss, 15 px rule | **DONE** | Measured diagonally; all four cases verified |
| P5.10 | Fix: Home mid-game was a no-op | **DONE** | Added `resetToken`; clearing an already-null prop changed no dependency |
| P5.11 | Landscape orientation | **TODO** | Phase 6 |

## Phase 6 — Landscape, polish, packaging

| # | Task | Status | Notes |
|---|---|---|---|
| P6.1 | Landscape geometry — Puzzle screen | **DONE** | `src/layout/landscape.ts`; layout group and TMP margins read from the scene YAML, not the dump |
| P6.2 | Orientation plumbing | **DONE** | `layout/chrome.ts` selects the data-driven parts; `LandscapeFooter` branches the flex-row mechanism (ADR-019) |
| P6.3 | Verify both orientations render | **DONE** | Landscape at 960×540 and portrait re-checked for regression — figures in [roadmap.md](roadmap.md) |
| P6.4 | Landscape geometry — ImageSelect, Browse, Crop, Win | **TODO** | Four more tables from `docs/ui/scene-landscape.md`. Note the landscape scene still has `ColorTint` buttons (U1) |
| P6.5 | Decide how a landscape build is packaged | **TODO** | **Needs a decision:** two installers with different `productName`/`identifier`, or make orientation a runtime setting instead of a build flag. Today it is `VITE_ORIENTATION` at build time |
| P6.6 | Brand pass | **DONE** | Ambers settled in ADR-013; chrome neutrals now `--chrome-*` tokens. Layout-table colours stay literal by design |
| P6.7 | 60 fps during tile animation at 4K | **TODO** | Needs the real hardware; tiles already animate with `transform` only |
| P6.8 | Memory stable across 100+ rebuilds | **TODO** | Blob URLs are revoked on replacement; needs a soak to confirm |
| P6.9 | 24 h soak test | **TODO** | Needs the kiosk |
| P6.10 | Test the installer on kiosk hardware | **TODO** | Installer works; hardware untested |
| P6.11 | Auto-start on boot + crash auto-restart | **TODO** | Windows task or registry Run key, plus a watchdog |

## Build & release tooling

| # | Task | Status | Notes |
|---|---|---|---|
| B1 | `build.bat` at the repo root | **DONE** | Installs deps, generates fonts/icons if missing, bumps the version, runs tests, builds, prints output paths. Refuses to ship on failing tests |
| B2 | Semantic versioning `x.y.z` with a single source of truth | **DONE** | `package.json` → `scripts/bump-version.ps1` syncs `tauri.conf.json` + `Cargo.toml`; `vite.config.ts` defines `__APP_VERSION__` |
| B3 | Version badge, bottom-left of the screen | **DONE** | `src/ui/VersionBadge.tsx`, viewport-fixed so it is outside the scaled canvas. `VITE_HIDE_VERSION=1` hides it for parity captures |
| B4 | `.gitattributes` pinning `*.bat` to CRLF | **DONE** | `cmd.exe` mis-parses an LF-only batch file and claims it does not exist |
| B5 | Code signing for the installer | **TODO** | Unsigned today → SmartScreen warning on first run on the kiosk. Needs a certificate from the client |
| B6 | Auto-start on boot + crash auto-restart | **TODO** | Phase 6 |

### §12 parity checklist status

| Item | Status |
|---|---|
| Shuffled board always solvable (move-based, never a permutation) | **DONE** — 10,000 boards, 0 unsolvable |
| Shuffle produces an unsolved board (bounded retry if solved) | **DONE** — 10,000 boards, 0 solved |
| Only Manhattan-distance-1 cells can move | **DONE** |
| Timer starts on first **player** move; auto-shuffle doesn't start it | **DONE** |
| Auto-shuffle never immediately reverses its previous move | **DONE** |
| Win fires only when all 8 tiles are home; 9th slice revealed | **DONE** |
| High score written only when strictly faster; `-1` renders `--:--` | **DONE** — an equal time does not overwrite |
| High score key is per **artwork title** | **DONE** — key shape byte-identical to Unity |
| Stale API responses discarded (request-id/abort guard) | **TODO** — Phase 3 |
| QR upload accepted only on ImageSelectOrUpload/Crop | **TODO** — Phase 4 |
| Input blocked while animating, solved, or preview visible | **DONE** — `canAcceptInput` |
| Screen transition can never leave a click-blocking overlay | **TODO** — Phase 5 |

Phases 2–6: see [roadmap.md](roadmap.md); expand into tasks when each phase starts.

---

## Unity-side follow-ups (current app, not the port)

| # | Task | Status | Notes |
|---|---|---|---|
| U1 | Landscape scene: buttons were `ColorTint`, need `SpriteSwap` + pressed sprites | **WIP** | Run `Tools ▸ MAP ▸ Setup Button Press Effect (Both Scenes)`, then save |
| U2 | Landscape `PlayAgainButton` has **no sprite** assigned | **TODO** | Tool assigns `PlayAgainButton.png`; confirm that's intended |
| U3 | Attach `ButtonPressOffset` to the 6 target buttons in both scenes | **WIP** | Same menu item as U1 |
| U4 | Font migration: Geometria/ArchivoNarrow → Conduit ITC in Landscape scene | **TODO** | `Tools ▸ MAP ▸ Swap Fonts (Active Scene)` |
| U5 | Move the hardcoded API key out of `Scripts/API/API.cs` | **TODO** | Security — also rotate the key. **AND the OAuth `client_secret`**, which is serialized in the scene YAML and therefore also in git history (ADR-016). Both must be rotated |
| U6 | Decide final on-screen-keyboard approach | **BLOCKED** | OS keyboard (osk/TabTip) proved unreliable; in-app keyboard recommended |

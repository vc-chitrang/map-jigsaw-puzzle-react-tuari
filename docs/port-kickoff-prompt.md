# Port kickoff prompt (copy into a new chat)

Paste everything inside the horizontal rules below as your first message in a fresh chat.

---

## PROJECT

Port an existing **Unity 6.3 kiosk application** to **React + TypeScript + Tauri v2**, packaged as a
**Windows `.exe`**. The app is a **sliding-puzzle kiosk for the Museum of Art & Photography (MAP),
Bangalore**: a visitor picks an artwork from MAP's collection API (or uploads a photo from their phone
via QR), crops it, and solves a 3×3 sliding-tile puzzle on it.

Goal: **pixel-for-pixel visual parity** with the Unity build, and identical game logic.

## SOURCE OF TRUTH — READ THESE FIRST, IN THIS ORDER

The Unity project is at:

    D:/Chitrang_ViitorCloud/R&D/Sliding-Puzzle

A complete, already-written porting spec lives in:

    D:/Chitrang_ViitorCloud/R&D/Sliding-Puzzle/Assets/Games/Sliding-Puzzle/docs/

Read in this order before writing any code:

1. `docs/project-overview.md` — what the app is, user flow, screen inventory, brand palette
2. `docs/architecture.md` — Unity module map + target React/Tauri design + **fragilities not to reproduce**
3. `docs/game-logic.md` — board model, slicing maths, shuffle algorithm, move/win rules, timer,
   high score, **full API contract**, socket, constants table, **parity test checklist**
4. `docs/ui-spec.md` — canvas/scaling model, the two RectTransform idioms, per-screen structure,
   **complete animation inventory with exact timings**
5. `docs/pixel-perfect-replication.md` — scale-factor formula, RectTransform→CSS recipes, text parity,
   board geometry, Tauri kiosk config, **numeric verification method**
6. `docs/asset-manifest.md` — every asset path + target location + a ready PowerShell copy script
7. `docs/ui/scene-portrait.md` and `docs/ui/scene-landscape.md` — **generated** exhaustive per-element
   dumps (anchors, size, pivot, sprite, font, colour, button transition) — the authoritative numbers
8. `docs/roadmap.md`, `docs/tasks.md`, `docs/decisions.md`, `docs/ai_handoff.md` — plan + prior decisions

Unity source worth reading directly: `Scripts/GameManager.cs`, `Scripts/TileController.cs`,
`Scripts/ArrowController.cs`, `Scripts/UIManager.cs`, `Scripts/ScreenManager.cs`,
`Scripts/UI/CollectionUIManager.cs`, `Scripts/API/*`, `Scripts/SocketIO/SocketConnection.cs`.

**Summarise your understanding before implementing** (the repo's `AGENTS.md` requires this).

## HARD CONSTRAINTS

- **Windows only.** Tauri v2 + React 18 + TypeScript + Vite.
- **Kiosk mode:** fullscreen, `decorations: false`, not resizable, always-on-top, no context menu,
  no text selection, no zoom gestures, no overscroll. **Include a staff exit hatch** (Unity uses
  double-Esc) — without it the kiosk cannot be closed.
- **Two orientations, one codebase:** Portrait reference **2160×3840**, Landscape **3840×2160**.
  Drive layout from geometry data tables, not media queries.
- **Scaling model is non-negotiable:** render the whole UI at reference size inside one wrapper with
  `transform: scale(f)` where `f = sqrt((screenW/refW) × (screenH/refH))` (Unity `match = 0.5`
  geometric mean). Use `transform: scale()`, never `zoom`, never `rem` scaling. Inside that wrapper
  Unity pixel values are used **verbatim**.
- **Game logic must be pure TypeScript** in `src/game/` — no React, no DOM — so the parity checklist
  in `game-logic.md §12` is unit-testable.
- **Touch-first**, 60 fps during tile animation at 4K. Animate with `transform: translate3d` only.

## SECURITY — MUST FOLLOW

`Assets/Games/Sliding-Puzzle/Scripts/API/API.cs` hardcodes the collection **API key** and a private
base URL. Do **not** replicate that:

- Put base URL + key in env/config; **gitignore** it. Never commit the key. Never print it in logs.
- Proxy collection requests through the **Tauri Rust side** (`collection_fetch` command) so the key
  never reaches renderer JS or DevTools.
- Tell me to **rotate the existing key** (it is committed in the Unity repo).

## KEY TECHNICAL FACTS (already verified — don't re-derive)

- Grid **3×3**. Grid **Y is top-down** (unlike Unity UI Y, which is bottom-up). In CSS Y is already
  downward, so the Unity sign flips **disappear** for grid maths — do not double-negate.
- `boardSize = min(parentW, parentH) × 0.9`, always square. `tileSpacing = 2` px.
  `cellSize = (boardSize − spacing × (cols−1)) / cols`.
- **Shuffle is move-based**: `max(12, cols×rows×3)` = 27 random legal moves from solved, never
  reversing the immediately-previous move, reshuffle if it lands solved (bound the retry). This
  guarantees solvability — never use a random permutation.
- **Timer starts on the first player move**, not on screen entry. Attract-mode auto-shuffle moves do
  **not** start it.
- Win = all 8 tiles at `CorrectCell`; then the 9th slice is revealed in the empty slot, then a **1 s**
  delay, then the win screen.
- High score key: `{productName}_HighScoreKey_{artworkTitle | textureName | "Default"}` — **per
  artwork**. Store seconds; `-1` renders `--:--`. Write only if strictly faster.
- Collection API params: `limit` (default **40**), `page`, `q`, `department`, `classification`,
  `artist`, `culture`, `date`, `sortBy`/`sortOrder`. Guard against stale responses with
  `AbortController` + request id (Unity uses a `_fetchId` counter).
- Socket.IO (`transports: ['polling']`) at `https://i-am-puzzle.map-india.org`, event `new-upload`
  → image URL. Accept it **only** while the ImageSelect or Crop screen is visible.
- **Timings:** tile slide **140 ms** `OutCubic` · arrow pulse `scale 1→1.06` **250 ms** linear
  infinite alternate · screen cross-fade **200 ms ×2** (`OutQuad` then `InQuad`, swap at black) ·
  crop rotate ±90° **300 ms** linear · attract auto-shuffle **1 s** interval · win delay **1 s**.
- Disabled footer buttons: label **and** icon at **alpha 0.3** (RGB unchanged). Button press: label +
  icon offset **(−10, −10) px** while held.
- Screens `QRScanScreen` and `Artwork Focus Screen` are **deprecated** — **do not port them**.

## THINGS THE UNITY BUILD GOT WRONG — DO NOT REPRODUCE

1. **Transition overlay could wedge the app.** An interrupted tween left a full-screen overlay
   blocking all clicks *and* a stuck `isTransitioning` flag, so the UI became unresponsive. Model the
   transition as explicit state (`idle | fadingOut | fadingIn`), derive `pointer-events` from it in
   exactly **one** place, and add a timeout fallback so a missed `transitionend` can't wedge it.
2. **OS on-screen keyboard is unusable.** `osk.exe` cannot be forced white (ignores the light theme);
   `TabTip.exe` has a theme but no reliable open/close state, and toggling double-fired causing
   blinking. → Build an **in-app React keyboard** (white/brand-styled) wired to the search field.
   See `decisions.md` ADR-006.
3. Unbounded shuffle recursion; hardcoded API key; runtime-created UI that designers can't tune.

## ASSETS

`docs/asset-manifest.md` lists **every** asset with source path → target path, plus a ready
`scripts/copy-assets.ps1`. Copy assets into `public/assets/**` and wire the script into
`predev`/`prebuild`.

Watch out for these hazards (documented in §10 of the manifest):
- **Spaces** in filenames: `Map Logo.png`, `new image icon.png`, `Frame 9.png`
- **Inconsistent case**: `ResetButton-Pressed.png` / `PlayAgainButton-Pressed.png` vs
  `StartButton-pressed.png` / `PreviewButton-pressed.png` / `NewImageButton-pressed.png`
  (Windows is case-insensitive, the web is **not** — normalise on copy)
- **Leading dash**: `-1_0.png` (board arrows are named by grid direction offset)
- Fonts: copy the **`.otf`/`.ttf` sources** and convert to `woff2` — do NOT use the 32 MB Unity SDF
  `.asset` files
- `Circle_9Sliced.png` border is uniform **255 px** → `border-image-slice: 255 fill`

## BUILD ORDER (follow `docs/roadmap.md`)

**Phase 0 — scaffold.** Tauri v2 + React + TS; `ScaledCanvas` + `useScaleFactor`; kiosk window config;
staff exit hatch; asset copy script.
*Exit:* a reference rectangle matches the Unity capture at 1080p / 1440p / 4K.

**Phase 1 — game core (pure TS, no UI).** `board.ts`, `shuffle.ts`, `moves.ts`, `highScore.ts`, timer
reducer + unit tests for every item in `game-logic.md §12`.
*Exit:* 10,000 random shuffles are always solvable and never start solved.

**Phase 2 — Puzzle screen.** Board, tiles, outline, arrows + pulse, footer (START⇄Timer swap, high
score badge, Reset/Preview/New Image), `Button` component (sprite swap + press offset + disabled
alpha), artwork title, attract-mode auto-shuffle, preview overlay.
*Exit:* pixel diff vs Unity capture **< 1 %**, differences confined to text antialiasing.

**Phase 3 — API + Browse.** Rust `collection_fetch`; abort-guarded TS client; search, 5 searchable
filter dropdowns, sort, pagination, result count; responsive card grid
(`auto-fill minmax(320px, 1fr)`, square cards, min 2 columns).

**Phase 4 — Crop + QR.** Canvas pan/pinch-zoom/rotate, square export, socket `new-upload`,
replace-in-place while cropping.

**Phase 5 — Win screen, navigation, in-app keyboard.**

**Phase 6 — Landscape, brand pass, packaging.** MSI/exe, auto-start, 24 h soak test.

Work **one phase at a time**; stop at each exit criterion and show me the result.

## VERIFICATION — measure, don't eyeball

Capture the Unity build at exactly 2160×3840 and 3840×2160, capture the port at the same size, and
diff numerically (`pixelmatch` or `magick compare -metric AE`). Target **< 1 %** differing pixels.
Also do a 50/50 overlay blend — misalignment shows instantly as ghosting. Full method in
`pixel-perfect-replication.md §9`.

## OPEN QUESTIONS — ASK ME BEFORE PHASE 2

1. **Fonts:** the build uses **Conduit ITC**, but the MAP style guide specifies Geometria (display) +
   Leitura News (body). Which is authoritative, and can you supply licensed `woff2` files?
   *(This blocks Phase 2.)*
2. **Artwork title colour:** code sets `#DCB63C`, its own comment and the brand guide say `#FFA300`
   (MAP Aamras). Which is correct?
3. **Caption colour** `#E7B639` — align to brand `#FFA300`?
4. `#67797F` (high-score badge tint) is not in the brand palette — keep or replace?
5. **Staff exit gesture** — keep double-Esc?
6. Do you have **reference screenshots** of every Unity screen at both resolutions? If not, I need
   them (or access to run the Unity build) to establish the pixel-diff baseline.

## WORKING AGREEMENT

- Follow the repo's `AGENTS.md`: keep `docs/tasks.md`, `docs/decisions.md` and `docs/ai_handoff.md`
  updated as you go; record modified files and the next recommended task.
- Prefer changes that work from existing code paths over steps a human must remember to run.
- Don't invent API fields, asset names, or geometry — everything is documented; if something is
  missing, say so and ask.
- Report honestly: if a phase's exit criterion isn't met, say so with the numbers.

**Start by reading the docs listed above, then give me: (a) your understanding summary, (b) the
Phase 0 plan, (c) answers you need from me.**

---

## Notes for the person pasting this

- If the new chat has no filesystem access to `D:/Chitrang_ViitorCloud/R&D/Sliding-Puzzle`, attach or
  paste these files instead: `game-logic.md`, `ui-spec.md`, `pixel-perfect-replication.md`,
  `asset-manifest.md`, and the relevant slices of `ui/scene-portrait.md`.
- The two `ui/scene-*.md` dumps are ~900 lines each. They're the authoritative geometry — attach them
  rather than summarising.
- Regenerate the dumps and manifest after any Unity scene change:

      python Assets/Games/Sliding-Puzzle/docs/tools/extract_ui.py
      python Assets/Games/Sliding-Puzzle/docs/tools/asset_manifest.py

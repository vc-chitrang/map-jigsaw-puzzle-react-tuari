# Continue-the-port prompt (copy into a new chat)

Paste everything between the horizontal rules as the first message of a fresh chat.

Keep this file updated at the end of each session — it is the fast path back into the work.

**Last updated:** 2026-07-30 · **State:** phases 0–5 complete, phase 6 geometry complete, 308 tests green

---

## PROJECT

Continue an in-progress port of a **Unity 6.3 kiosk app** to **React 18 + TypeScript + Vite +
Tauri v2**, packaged as Windows `.exe`. It is a **3×3 sliding-puzzle kiosk** for the Museum of Art &
Photography (MAP), Bangalore: a visitor picks an artwork from MAP's collection API (or uploads a photo
from their phone via QR), crops it, and solves the puzzle on it.

Working directory:

    D:\Chitrang_ViitorCloud\Projects\MVP\map-jigsaw-puzzle-react-tuari

The Unity original (source of truth for geometry and behaviour):

    D:\Chitrang_ViitorCloud\R&D\Sliding-Puzzle

## READ FIRST, IN THIS ORDER

1. `AGENTS.md` — the working agreement. Follow it, including keeping `docs/tasks.md`,
   `docs/decisions.md` and `docs/ai_handoff.md` updated as you go.
2. `docs/ai_handoff.md` — **start here.** Current state, what each phase delivered, the traps already
   found, and §8 "recommended next task".
3. `docs/decisions.md` — ADR-001 … ADR-023. Read at least 014–023; they are all corrections to the
   written spec that cost real time to discover.
4. `docs/tasks.md` — live task list with per-item status.
5. `docs/roadmap.md` — phase plan with measured exit criteria.

## THE MOST IMPORTANT LESSON

**The Unity SCENE is the source of truth — not the prose docs, not the C# field initialisers, and not
the generated element dumps.** This has now bitten four times:

| ADR | What the docs said | What actually ships |
|---|---|---|
| 015 | padding 0.9, spacing 2, shuffle ×3, arrow 0.38 | **0.704, 6, ×1 (12 moves), 0.35** — the scene overrides the C# defaults |
| 016 | collection API takes `?key=` | **500s without an OAuth bearer token**; login is required |
| 017 | crop screen pans and pinch-zooms | **a resizable square grid**; the zoom slider is under an inactive parent |
| 019 | footer geometry from the dump | **a `HorizontalLayoutGroup`**; the dump shows all five controls at `pos (0,0)` |
| 022 | crop handles 80 px @ 0.9, min 0.2 | **50 px opaque, min 0.5** — the scene again, fifth time |

…and the inverse trap, also ADR-022: `CardGrid` has **no** `GridLayoutGroup` in either scene, so for
the card grid the *runtime code* (`SetupGridLayout`: spacing 16, padding 16/16/16/40, square cells) is
the source of truth and the scene has nothing to say. Ask which source the running build reads.

Before implementing anything from a doc description, open the scene YAML:

    D:\Chitrang_ViitorCloud\R&D\Sliding-Puzzle\Assets\Games\Sliding-Puzzle\Scenes\MAP_PuzzleScene_Portrait.unity
    ...\MAP_PuzzleScene_Landscape.unity

`docs/tools/extract_ui.py` generated `docs/ui/scene-*.md`, but it only parses `RectTransform`, `Image`,
`TMP_Text`, `Button`, `CanvasScaler` and `GridLayoutGroup`. It does **not** report layout groups, TMP
margins, TMP alignments, or `ContentSizeFitter` — read those from the YAML directly.

Treat an `[X]` name prefix or an inactive parent as **"does not ship"**.

**Do not invent geometry, asset names or API fields.** If something is missing, say so and ask.

## WHAT IS ALREADY BUILT

* **Phase 0** — Tauri v2 + React 18 + Vite scaffold; `ScaledCanvas` implementing Unity's
  `CanvasScaler` (`scale = sqrt((sw/rw)×(sh/rh))`, match 0.5); kiosk lockdown; double-Esc staff exit;
  asset/font/icon/pixel-diff/API-config scripts.
* **Phase 1** — pure-TS game core in `src/game/` (no React, no DOM): move-based shuffle, moves, timer,
  per-artwork high score, and a two-step move reducer matching Unity's `MoveTileRoutine` ordering.
* **Phase 2** — Puzzle screen, pixel geometry from `src/layout/portrait.ts`.
* **Phase 3** — Rust `collection_fetch` / `image_fetch` / `public_config` with an OAuth token cache;
  TS client with a request-id guard; Browse screen with search, five searchable filters, sort and
  pagination. **Verified against the live API: 32,305 artworks.**
* **Phase 4** — Crop screen (square grid, corner handles, rotate ±90°, square export at source
  resolution); ImageSelect screen with the QR panel; `socket.io` `new-upload` gated to those two
  screens.
* **Phase 5** — `ScreenRouter` with the fail-safe cross-fade; Win screen; in-app on-screen keyboard
  wired to all six text fields; the 15 px tap-versus-drag dismiss rule.
* **Phase 6** — **all five screens in both orientations.** Landscape tables in
  `src/layout/landscape.ts` (Puzzle), `crop-landscape.ts` (ImageSelect + Crop), `browse-landscape.ts`,
  `win-landscape.ts`, selected per screen by `src/layout/screens.ts` (ADR-021). Two-installer
  packaging (ADR-020). Four parity defects found and fixed while verifying — ADR-022 and ADR-023,
  **all of which affected portrait too**, including a board that rendered completely **black** after a
  crop because two owners were revoking one blob URL.

Build: `build.bat` (portrait) or `build.bat landscape`. Both bump the patch version; add `same` to
hold it. 308 tests: `npm test`.

## YOUR TASK — close out phase 6

In this order:

1. **Auto-start on boot + crash auto-restart** (P6.11 / B6) — the only remaining item that can be
   built and tested without the kiosk. A scheduled task or a `Run` key, plus a watchdog.
2. **Performance** — 60 fps during the tile slide at 4K, memory stable across 100+ board rebuilds.
   Tiles already animate with `transform` only, and each blob URL now has exactly one owner.
3. **24 h soak test** and the kiosk-hardware install — these need the real machine.
4. **Code signing (B5)** — two artefacts to sign, so start the procurement early.

## KNOWN BLOCKED / OUTSTANDING

* **Pixel-parity diff (P2.11, D7).** Agreed capture size is **540×960**. `scripts/pixel-diff.mjs` and
  `scripts/capture-window.ps1` are written, but `Graphics.CopyFromScreen` fails from a
  non-interactive shell — run it from a normal interactive terminal. Procedure in
  `docs/ai_handoff.md` §10.
* **`git push` fails with 403.** The stored credential is `vc-chitrang`; the remote belongs to
  `chitrang313`, and `origin/main` is gone locally. Commits are waiting locally. The user must grant access, repoint the remote, or
  swap credentials — do not attempt to work around authentication.
* **Code signing (B5).** The installer is unsigned, so SmartScreen warns on first run. Needs a
  certificate from the client.
* **`PerPageDD` (P3.11).** Active in the scene but its option list is in neither the scene nor the
  docs. Not guessed. `limit` stays at the documented 40.
* **Card internal geometry (P3.12).** The card prefab is not in the repository, so the card's internal
  layout is unverified — see the header note in `src/layout/browse.ts`. The card's OUTER size is now
  settled: `UpdateGridCellSize` makes the cell square, so the card is square with the caption inside.
* **Real phone upload (P4.11).** Socket wiring is unit-tested but never exercised against the actual
  phone-side upload page.

## SECURITY — RAISE THIS AGAIN IF IT IS STILL OPEN

`Assets/Games/Sliding-Puzzle/Scripts/API/API.cs` hardcodes the collection **API key**, and the OAuth
**`client_secret`** is serialized in the scene YAML. Both are therefore in the Unity repository's git
history and must be treated as compromised. **Both need rotating server-side** — deleting them from a
future commit does not remove them from history.

The port side is already correct: both live in a gitignored `src-tauri/.env`, are read only by the Rust
side, are logged by length rather than value, and never reach the renderer. Keep it that way — the
renderer's Tauri capability set grants window control and nothing else.

## HOW TO VERIFY — measure, do not eyeball

`npm test` and `npm run build` must both stay green (276 tests).

For screens, run `npm run dev` (add `VITE_ORIENTATION=landscape` for the landscape build) and drive it
in a browser at **540×960** (portrait) or **960×540** (landscape), stubbing the Rust side:

```js
window.__TAURI_INTERNALS__ = {
  invoke: async (cmd, args) => {
    if (cmd === 'public_config') return { socket_url: '', collection_available: true };
    if (cmd === 'collection_fetch') return /* a MAPData fixture */;
    if (cmd === 'image_fetch') { const r = await fetch(args.url); return Array.from(new Uint8Array(await r.arrayBuffer())); }
    throw new Error('unknown command: ' + cmd);
  },
};
```

**No `initScript` needed.** `isTauri()` is evaluated per call, so installing that object *after* load
works; point each fixture's `primary_image` at a bundled asset (`/assets/fallback/fallback-01.png`) and
the whole Browse → Crop → Puzzle chain runs offline. If Browse already failed before the stub landed,
type in the search field and press Enter to refetch.

Gotchas that will waste your time otherwise:

* **`SpriteButton` fires on `pointerup`, not `click`.** A synthetic `.click()` does nothing — dispatch
  `pointerdown` then `pointerup` **on the element** (a `window`-level dispatch from a devtools isolated
  world never reaches React).
* **The canvas can render at `scale(0)`** if the scale factor was computed while the viewport measured
  0 (an undisplayed pane). Resize the window once after load to force a recompute.
* **A passing DOM assertion is not a visible UI.** Twice now: the win screen hid behind the preview
  panel while `innerText` said "You Win!" (ADR-018), and the board rendered eight black tiles with
  perfect `background-size` after a crop (ADR-023). **Take a screenshot, or sample a pixel.**
* To reach the win screen, solve the board from outside: read each tile's `background-position`
  (correct cell) and `translate3d` (current cell), BFS, then tap the tiles ~200 ms apart.

Report honestly: give numbers for what you verified, and say plainly what you did not verify and why.

---

## Notes for the person pasting this

* Everything above is in the repo, so a fresh session with filesystem access needs no attachments.
* If the session has **no** access to `D:\Chitrang_ViitorCloud\R&D\Sliding-Puzzle`, say so up front —
  the Unity scenes are needed for any new geometry, and asset/font copying will fail.
* Regenerate the element dumps after any Unity scene change:

      python docs/tools/extract_ui.py
      python docs/tools/asset_manifest.py

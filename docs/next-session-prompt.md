# Continue-the-port prompt (copy into a new chat)

Paste everything between the horizontal rules as the first message of a fresh chat.

Keep this file updated at the end of each session — it is the fast path back into the work.

**Last updated:** 2026-07-30 · **State:** phases 0–5 complete, phase 6 part-done, 276 tests green

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
3. `docs/decisions.md` — ADR-001 … ADR-020. Read at least 014–020; they are all corrections to the
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
* **Phase 6 (part)** — landscape **Puzzle** screen from `src/layout/landscape.ts`; two-installer
  packaging (ADR-020).

Build: `build.bat` (portrait) or `build.bat landscape`. Both bump the patch version; add `same` to
hold it. 276 tests: `npm test`.

## YOUR TASK — finish phase 6

In this order:

1. **Landscape geometry tables for ImageSelect, Browse, Crop and Win.** Source:
   `docs/ui/scene-landscape.md` plus the scene YAML for anything the dump cannot express. Follow the
   `src/layout/landscape.ts` pattern: transcribe verbatim, document every way it differs from
   portrait, and expect at least one structural surprise per screen. Note the landscape scene still
   has `ColorTint` buttons rather than `SpriteSwap` (task U1).
2. **Performance** — 60 fps during the tile slide at 4K, memory stable across 100+ board rebuilds.
   Tiles already animate with `transform` only. Blob URLs are revoked on replacement; confirm with a
   long run.
3. **Auto-start on boot + crash auto-restart** for the kiosk.
4. **24 h soak test** and the kiosk-hardware install — these need the real machine.

## KNOWN BLOCKED / OUTSTANDING

* **Pixel-parity diff (P2.11, D7).** Agreed capture size is **540×960**. `scripts/pixel-diff.mjs` and
  `scripts/capture-window.ps1` are written, but `Graphics.CopyFromScreen` fails from a
  non-interactive shell — run it from a normal interactive terminal. Procedure in
  `docs/ai_handoff.md` §10.
* **`git push` fails with 403.** The stored credential is `vc-chitrang`; the remote belongs to
  `chitrang313`. Three commits are waiting locally. The user must grant access, repoint the remote, or
  swap credentials — do not attempt to work around authentication.
* **Code signing (B5).** The installer is unsigned, so SmartScreen warns on first run. Needs a
  certificate from the client.
* **`PerPageDD` (P3.11).** Active in the scene but its option list is in neither the scene nor the
  docs. Not guessed. `limit` stays at the documented 40.
* **Card internal geometry (P3.12).** The card prefab is not in the repository, so the card's internal
  layout is unverified — see the header note in `src/layout/browse.ts`.
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

For screens, run `npm run dev` and drive it with Chrome DevTools viewport emulation at **540×960**
(portrait) or **960×540** (landscape), stubbing the Rust side:

```js
window.__TAURI_INTERNALS__ = {
  invoke: async (cmd) => {
    if (cmd === 'public_config') return { socket_url: '', collection_available: true };
    if (cmd === 'collection_fetch') return /* a MAPData fixture */;
    if (cmd === 'image_fetch') return /* an ArrayBuffer */;
    throw new Error('unknown command: ' + cmd);
  },
};
```

Pass that as an `initScript` so it runs before the app's own scripts.

Two gotchas that will waste your time otherwise:

* **`SpriteButton` fires on `pointerup`, not `click`.** A synthetic `.click()` does nothing — dispatch
  `pointerdown` then `pointerup`.
* **A passing DOM assertion is not a visible UI.** The win screen was completely hidden behind the
  preview panel while `innerText` still contained "You Win!". Take a screenshot.

Report honestly: give numbers for what you verified, and say plainly what you did not verify and why.

---

## Notes for the person pasting this

* Everything above is in the repo, so a fresh session with filesystem access needs no attachments.
* If the session has **no** access to `D:\Chitrang_ViitorCloud\R&D\Sliding-Puzzle`, say so up front —
  the Unity scenes are needed for any new geometry, and asset/font copying will fail.
* Regenerate the element dumps after any Unity scene change:

      python docs/tools/extract_ui.py
      python docs/tools/asset_manifest.py

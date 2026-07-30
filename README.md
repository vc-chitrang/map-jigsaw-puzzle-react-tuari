# MAP Sliding Puzzle — React + Tauri port

Kiosk application for the **Museum of Art & Photography (MAP), Bangalore**. A port of the
shipping Unity 6.3 build to **React 18 + TypeScript + Vite + Tauri v2**, packaged as a Windows
`.exe`. Target: **pixel-for-pixel parity** with the Unity build and identical game logic.

Full specification lives in [`docs/`](docs/). Start with
[`docs/ai_handoff.md`](docs/ai_handoff.md), then
[`docs/architecture.md`](docs/architecture.md) and [`docs/roadmap.md`](docs/roadmap.md).

**Working agreement:** see [`AGENTS.md`](AGENTS.md) — keep `docs/tasks.md`, `docs/decisions.md`
and `docs/ai_handoff.md` current as you go.

---

## Requirements

| Tool | Version used |
|---|---|
| Node | 22.16 |
| Rust | 1.96 (MSVC toolchain) |
| Python | 3.13 — only for the font conversion |
| Windows | 10/11, WebView2 (bundled by the installer) |

The Unity project must be reachable for asset and font extraction. Default location:
`D:/Chitrang_ViitorCloud/R&D/Sliding-Puzzle` — override with `-UnityRoot` on any script.

---

## First run

```bash
npm install
npm run build:fonts
npm run build:icons
npm run tauri:dev
```

`copy:assets` runs automatically before `dev` and `build`. Fonts and icons are one-off steps.

## Building a release

```bash
build.bat
```

That is the whole thing. It installs dependencies if needed, generates fonts and icons if missing,
**bumps the patch version**, runs the tests, builds, and prints the installer and `.exe` paths.

| Command | Orientation | Version effect |
|---|---|---|
| `build.bat` | portrait | patch: `0.1.0` → `0.1.1` |
| `build.bat landscape` | landscape | patch |
| `build.bat minor` | portrait | minor: `0.1.4` → `0.2.0` |
| `build.bat landscape major` | landscape | major: `0.2.7` → `1.0.0` |
| `build.bat same` | portrait | unchanged — rebuild the current version |

Arguments may be given in either order. Version words: `patch` (default), `minor`, `major`, `same`.
Orientation words: `portrait` (default), `landscape`.

### Two products, one version

Portrait and landscape are **separate installers** that coexist (ADR-020). The landscape build applies
`src-tauri/tauri.landscape.conf.json` as a config overlay, changing only `productName` and
`identifier`; everything else — CSP, bundle settings, icons — stays in the base config.

Because the identifiers differ, the two products get separate WebView2 data and separate
`localStorage`, so **high scores do not carry between orientations**. Both share the version from
`package.json`.

Note the Cargo binary keeps one name, so a landscape build overwrites the *portable* exe left by a
portrait build. Only the installers are durable side by side.

Output:

| Artefact | Path | Size | Notes |
|---|---|---|---|
| Installer | `src-tauri/target/release/bundle/nsis/MAP Jigsaw Puzzle_<version>_x64-setup.exe` | ~216 MB | Per-machine, needs admin. Bundles the **WebView2 offline installer**, which is nearly all of the size — see ADR-011 |
| Portable exe | `src-tauri/target/release/map-jigsaw-puzzle.exe` | ~12 MB | No install. Requires WebView2 already present (it is, on any machine with Edge). Fastest way to smoke-test a build |

The exe is named after the **Cargo package**, not `productName`. Set `mainBinaryName` in
`tauri.conf.json` if that should change.

A release build opens **fullscreen and always-on-top**. Press **Esc twice within 1 second** to exit.

The build fails on failing tests rather than shipping red.

> The installer is **not code-signed**, so Windows SmartScreen warns on first run. A signing
> certificate has to come from the client — tracked as B5 in [docs/tasks.md](docs/tasks.md).

### Versioning

`package.json` is the **single source of truth**. `scripts/bump-version.ps1` increments it and copies
the value into `src-tauri/tauri.conf.json` (installer/exe file version) and `src-tauri/Cargo.toml`
(crate version). `vite.config.ts` reads it at build time and defines `__APP_VERSION__`, which the
badge at the bottom-left of the screen displays. **Nothing hardcodes a version.**

To bump without building:

```bash
powershell -ExecutionPolicy Bypass -File scripts/bump-version.ps1
```

Set `VITE_HIDE_VERSION=1` to hide the badge — do that for pixel-parity captures, since the badge is
an addition the Unity build does not have.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server on `127.0.0.1:1420` (browser only) |
| `npm run tauri:dev` | Tauri shell + dev server. **Windowed** while developing |
| `npm run tauri:build` | NSIS installer with a bundled WebView2 offline installer |
| `npm run bump:version` | Bump the patch version and sync every file that carries one |
| `npm run copy:assets` | Unity sprites → `public/assets`, with filename normalisation |
| `npm run build:fonts` | Conduit ITC `.otf`/`.ttf` → `public/fonts/*.woff2` |
| `npm run build:icons` | Squares the MAP logo on black, then generates app icons |
| `npm run extract:api-config` | Unity `API.cs` → gitignored `src-tauri/.env` (prints no secrets) |
| `npm test` | Vitest |
| `npm run diff:pixels` | Numeric pixel-parity diff (see below) |

### Kiosk mode while developing

The window is declared *windowed and decorated* in `tauri.conf.json`, then promoted to
fullscreen / undecorated / always-on-top at startup by `src-tauri/src/kiosk.rs`. Promotion
happens in release builds automatically, or on demand:

```bash
set MAP_KIOSK=1 && npm run tauri:dev
```

This keeps `tauri:dev` from covering your editor while still letting you test the real thing.

**Exit hatch: press `Esc` twice within 1 second.** Same gesture as the Unity build. It is
installed before React renders (`src/main.tsx`), so it still works if the UI fails to mount —
without it a fullscreen undecorated kiosk cannot be closed.

---

## Pixel parity

The whole UI renders at reference resolution (portrait **2160×3840**) inside one
`transform: scale(f)` wrapper, where `f = sqrt((screenW/2160) × (screenH/3840))` — Unity's
`CanvasScaler` with `match = 0.5`. Inside that wrapper, Unity numbers are used verbatim.
See [`docs/pixel-perfect-replication.md`](docs/pixel-perfect-replication.md) and ADR-007.

Verify numerically, never by eye:

```bash
node scripts/pixel-diff.mjs captures/unity-portrait.png captures/port-portrait.png captures/diff.png
```

Budget is **1 %** differing pixels, with differences confined to glyph antialiasing.

### Capturing the baseline

The Unity build is at
`D:/Chitrang_ViitorCloud/R&D/Sliding-Puzzle/Builds/Windows/MAP Jigsaw Puzzle-0.1.2-2/`.
Force a windowed size and screenshot it:

```bash
"MAP Jigsaw Puzzle-0.1.2-2.exe" -screen-width 1080 -screen-height 1920 -screen-fullscreen 0
```

**Constraint:** a window cannot exceed the physical display, so a true 2160×3840 capture needs
4K portrait hardware. On a normal monitor, capture *both* builds at the same smaller size
(e.g. 1080×1920) — the scale factor is uniform, so parity verified at one size holds at every
size. Record the capture size next to any reported diff number.

---

## Layout

```
src/
├── canvas/       ScaledCanvas + the scale factor — the only place scaling exists
├── kiosk/        exit hatch, browser lockdown (installed before React renders)
├── dev/          Phase 0 pixel-parity harness
├── styles/       tokens.css (brand palette), fonts.css, global.css
├── game/         (Phase 1) pure TypeScript rules — no React, no DOM
├── screens/      (Phase 2+)
├── api/          (Phase 3)
└── layout/       (Phase 2) geometry tables per orientation
src-tauri/        Rust shell: kiosk window, later collection_fetch + image_fetch
scripts/          asset copy, font build, icon build, API config, pixel diff
```

## Security

* The API key is **never** in the repo and never in the renderer. It lives in gitignored
  `src-tauri/.env` and is used only by the Rust side.
* The key currently in the Unity repository is in git history and **must be rotated**.
* The Tauri capability set (`src-tauri/capabilities/default.json`) grants the renderer window
  control and nothing else — no filesystem, no shell, no process access.

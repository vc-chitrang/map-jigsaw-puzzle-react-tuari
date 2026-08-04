# MAP Jigsaw Puzzle — Kiosk App

Touchscreen sliding-puzzle kiosk for the **Museum of Art & Photography (MAP), Bangalore**.

Visitors pick artwork from MAP's live collection — or upload their own photo by QR code — crop it,
and solve it as a 3×3 sliding puzzle. Built with **React 18 + TypeScript + Vite + Tauri v2** and
shipped as a Windows installer that runs fullscreen and always-on-top on 4K kiosk hardware.

**Two products, one codebase:** portrait (2160×3840) and landscape (3840×2160) build as separate
installers that coexist on the same machine.

| | |
|---|---|
| **Stack** | React 18, TypeScript, Vite, Tauri v2 (Rust), WebView2 |
| **Target** | Windows 10/11, 4K touchscreen, portrait or landscape |
| **Tests** | 321 Vitest + 16 Pester |
| **Docs** | [`docs/`](docs/) — start with [`ai_handoff.md`](docs/ai_handoff.md), then [`architecture.md`](docs/architecture.md) and [`decisions.md`](docs/decisions.md) |

---

## Quick start

```bash
npm install
npm run tauri:dev
```

That is all a fresh clone needs. Artwork, fonts and app icons are **committed**, so there is no
asset-generation step.

The one exception is **`src-tauri/.env`**, which holds the collection API key and OAuth
credentials. It is gitignored and must never be committed — copy it in out of band from
`src-tauri/.env.example`. Without it the app still runs: it falls back to the bundled offline
artwork instead of the live collection.

### Requirements

| Tool | Version used |
|---|---|
| Node | 22.16 |
| Rust | 1.96 (MSVC toolchain) |
| Windows | 10/11 — WebView2 is bundled by the installer |

---

## Building a release

```bash
build.bat
```

Installs dependencies if needed, **bumps the patch version**, runs the tests, builds, and prints
the installer and `.exe` paths. It refuses to build on failing tests.

| Command | Orientation | Version |
|---|---|---|
| `build.bat` | portrait | patch — `0.1.0` → `0.1.1` |
| `build.bat landscape` | landscape | patch |
| `build.bat minor` | portrait | minor — `0.1.4` → `0.2.0` |
| `build.bat landscape major` | landscape | major — `0.2.7` → `1.0.0` |
| `build.bat same` | portrait | unchanged — rebuild the current version |

Arguments work in either order. Version words: `patch` (default), `minor`, `major`, `same`.
Orientation words: `portrait` (default), `landscape`.

### Output

| Artefact | Path | Size |
|---|---|---|
| Installer | `src-tauri/target/release/bundle/nsis/…_x64-setup.exe` | ~218 MB |
| Portable exe | `src-tauri/target/release/map-jigsaw-puzzle.exe` | ~24 MB |

**~194 MB of the installer is Microsoft's WebView2 runtime**, not this app. It is bundled as an
offline installer so a gallery machine with no network can still be set up. Switching to the
download bootstrapper would cut the installer to ~25 MB but requires internet at install time.

The portable exe needs WebView2 already present (it is, on any machine with Edge) and is the
fastest way to smoke-test a build.

> The installer is **not code-signed**, so SmartScreen warns on first run. A certificate has to
> come from the client.

### Two products, one version

The landscape build applies `src-tauri/tauri.landscape.conf.json` as a config overlay, changing
only `productName` and `identifier`. Because the identifiers differ, the two products get separate
WebView2 data and separate `localStorage` — so **high scores do not carry between orientations**.
Both share the version from `package.json`.

The Cargo binary keeps one name, so a landscape build overwrites the *portable* exe left by a
portrait build. Only the installers are durable side by side.

### Versioning

`package.json` is the single source of truth. `scripts/bump-version.ps1` increments it and copies
the value into `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`. `vite.config.ts` exposes it
as `__APP_VERSION__`, which the badge at the bottom-left displays. **Nothing hardcodes a version.**

```bash
npm run bump:version
```

Set `VITE_HIDE_VERSION=1` to hide the badge.

---

## Screens and flow

```
Puzzle (home)  ──START──▶  Image Select  ──▶  Select The Collection  ──▶  Browse  ──▶  Crop  ──▶  Puzzle
                                │
                                └── QR upload ─────────────────────────────────────────▶  Crop
```

| Screen | Purpose |
|---|---|
| **Puzzle** | The board. Attract mode auto-shuffles until a visitor touches it; then the timer starts. Win popup overlays it |
| **Image Select** | Two choices — browse MAP's collection, or scan a QR code to upload a photo |
| **Select The Collection** | Six department tiles over a scrolling artwork collage |
| **Browse** | Search, five filters, sort, paginated artwork grid |
| **Crop** | Square crop grid with four corner handles and ±90° rotation |

Back unwinds `Browse → Select The Collection → Image Select → Puzzle`.

**The home screen is pinned to one artwork** (accession `MAC.00468`, "Universe") so the kiosk always
presents the same piece at rest. Nothing on that path is random.

---

## How it renders

The entire UI is laid out at a fixed **reference resolution** and scaled by one GPU-composited
`transform: scale(f)` wrapper:

```
f = sqrt((screenW / refW) × (screenH / refH))
```

Portrait reference is 2160×3840, landscape 3840×2160 — so on native 4K hardware `f = 1.0` and the
UI is pixel-for-pixel 1:1 with no scaling at all. Inside the wrapper everything is authored in
reference pixels, and `src/canvas/` is the **only** place scaling exists.

DPI scaling needs no special handling: at 200 % Windows scaling the webview reports half the
pixels, `f` halves to 0.5, and WebView2 paints the result at 2× — sharp and correct.

---

## Kiosk behaviour

A release build opens **fullscreen, undecorated and always-on-top**, and re-asserts both for the
whole session — Windows surrenders topmost whenever another process claims it (another app going
fullscreen, a UAC prompt, an Explorer restart).

**Exit hatch: press `Esc` twice within 1 second.** Installed before React renders, so it still
works if the UI fails to mount — without it a fullscreen undecorated kiosk cannot be closed.

While developing, the window is windowed and decorated so it does not cover your editor. To test
the real thing on demand:

```bash
set MAP_KIOSK=1 && npm run tauri:dev
```

Startup logs the display it landed on (size, DPI scale, name), which distinguishes "fullscreen on
the wrong monitor" from "4K panel running a scaled desktop resolution".

### On-screen keyboard

The kiosk uses the **Windows TabTip** touch keyboard, orchestrated from the Rust side. The app
ships no keyboard of its own — doing both put two keyboards on screen at once.

### Auto-start on boot + crash restart

**Opt-in and off by default.** The build itself restarts nothing. **Do not enable it on a machine
where a separate launcher manages the app lifecycle** — a watchdog reopening this app on close
would fight the launcher.

Double-click `scripts/kiosk/enable-autostart.cmd` (or `disable-autostart.cmd`). They ask for admin
and prompt for orientation.

```
scheduled task (at logon)  →  scripts/kiosk/kiosk-watchdog.ps1  →  app
```

Supervision is from the **outside**, because a restart mechanism inside the app cannot revive it
once the process is gone. The watchdog relaunches on a crash with backoff, cools off 5 minutes on a
crash loop, and **stops on a clean exit** — a clean exit is the staff double-Esc, so staff always
keep a way out.

The trigger is **logon**, not startup, because a WebView2 GUI needs a desktop session — so the
kiosk must be set to auto-login a dedicated account. Preview before registering:

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/kiosk/install-autostart.ps1 -DryRun
```

Everything here is PowerShell, since the kiosk has no Node. The restart policy is covered by
`npm run test:watchdog`.

Not yet covered: a WebView2 renderer crash that leaves the host process alive, and a hang. Both
need a health signal from the running app.

---

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server on `127.0.0.1:1420` (browser only) |
| `npm run tauri:dev` | Tauri shell + dev server, windowed |
| `npm run tauri:build` | NSIS installer |
| `npm test` | Vitest — 321 tests |
| `npm run test:watchdog` | Pester — 16 tests, the kiosk restart policy |
| `npm run typecheck` | `tsc -b` with no emit |
| `npm run bump:version` | Bump the patch version and sync every file carrying one |
| `npm run build:icons` | Regenerate app icons from `src-tauri/icon-source.png` |
| `npm run extract:api-config` | Write `src-tauri/.env` (prints names and lengths, never values) |
| `npm run check:api` | Probe the collection API — reports status and shape, no secrets |

`copy:assets` and `build:fonts` are retained from the original asset pipeline. They are **not
needed here** — the artwork and fonts they produce are committed — and `copy:assets` skips with
exit 0 when `public/assets` is already populated, which it always is in this repo.

---

## Layout

```
src/
├── canvas/      ScaledCanvas + scale factor — the only place scaling exists
├── game/        pure TypeScript rules: board, moves, shuffle, timer, high score
├── layout/      geometry tables, one per screen per orientation
├── screens/     Puzzle, ImageSelect, SelectCollection, Browse, Crop, Win
├── navigation/  router + the fail-safe cross-fade
├── api/         collection client, types, departments, upload socket
├── image/       crop maths and square export
├── kiosk/       exit hatch + browser lockdown, installed before React renders
├── storage/     high-score persistence
├── ui/          shared components — buttons, loading overlay, text truncation
└── styles/      tokens.css (brand palette), fonts.css, global.css

src-tauri/src/
├── kiosk.rs     fullscreen / always-on-top, re-asserted for the session
├── api.rs       collection_fetch + image_fetch, with disk caching
├── keyboard.rs  Windows TabTip orchestration
└── config.rs    env resolution; logs presence and length, never values

scripts/
├── kiosk/       auto-start watchdog + scheduled-task install/uninstall
└── *.ps1        version bump, icons, API config, API probe
```

---

## Testing

```bash
npm test                 # 321 Vitest — game rules, layout maths, router, API helpers
npm run test:watchdog    # 16 Pester — kiosk restart policy (kept out of npm test)
```

The game core in `src/game/` is pure TypeScript with no React and no DOM, so the rules — shuffle
solvability, move legality, win detection, timer, high score — are all unit-testable directly. One
test shuffles 10,000 boards and verifies every one is solvable by an independent inversion-parity
check.

UI work is verified in a real browser at emulated kiosk resolutions rather than by snapshot, and
screenshots are used for anything visual. A passing DOM assertion is not a visible UI — that has
bitten this project more than once.

---

## Security

* **The API key is never in the repo and never in the renderer.** It lives in gitignored
  `src-tauri/.env` and is read only by the Rust side, so it cannot be recovered from the packaged
  front-end bundle or from DevTools.
* Collection requests are proxied through Rust (`collection_fetch`), and `image_fetch` enforces a
  host allow-list so it is not an open proxy.
* The Tauri capability set (`src-tauri/capabilities/default.json`) grants the renderer window
  control and nothing else — no filesystem, no shell, no process access.
* Error messages from the API layer are scrubbed of URLs so a key cannot reach a log.

> **Outstanding:** the collection API key and the OAuth `client_secret` were previously committed to
> another repository's history and must be treated as compromised. **They need rotating
> server-side** — nothing in this repo can retract a value already in another repo's history.

---

## Documentation

[`docs/`](docs/) is the engineering record, kept current as work proceeds (see [`AGENTS.md`](AGENTS.md)).

| File | Contents |
|---|---|
| [`ai_handoff.md`](docs/ai_handoff.md) | Current state and the traps worth knowing before touching anything |
| [`architecture.md`](docs/architecture.md) | Module boundaries and why they are where they are |
| [`decisions.md`](docs/decisions.md) | Numbered decision log — every non-obvious choice, with its rationale |
| [`tasks.md`](docs/tasks.md) | Live task list |
| [`game-logic.md`](docs/game-logic.md) | Game rules and the API contract |
| [`ui-spec.md`](docs/ui-spec.md) | Screen-by-screen UI specification |

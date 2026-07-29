# Project Overview — MAP Sliding Puzzle (React + Tauri port)

## What this application is

A **kiosk application** for the **Museum of Art & Photography (MAP), Bangalore**. A visitor
picks an artwork from MAP's collection (or uploads a photo from their phone via QR), crops it,
and plays a **3×3 sliding-tile puzzle** on that image. Times are recorded as a per-artwork high
score.

It currently ships as a **Unity 6.3 LTS** desktop application (Windows, DX11) in two builds:
**Portrait** (2160×3840) and **Landscape** (3840×2160) — both 4K kiosk displays.

This `docs/` set exists to **port that application to React + Tauri** (Tauri for `.exe`
packaging) with **pixel-for-pixel** visual parity.

## Target stack for the port

| Concern | Unity (current) | React + Tauri (target) |
|---|---|---|
| Shell / packaging | Unity Player `.exe` | **Tauri v2** (Rust shell) → `.exe`/MSI |
| UI | uGUI Canvas + TextMeshPro | **React + TypeScript**, CSS (see [pixel-perfect-replication.md](pixel-perfect-replication.md)) |
| Animation | DOTween | CSS transitions / Framer Motion / WAAPI |
| HTTP | BestHTTP / UnityWebRequest | `fetch` (or Tauri HTTP plugin for CORS-free calls) |
| Realtime | BestHTTP SocketIO3 | `socket.io-client` |
| Persistence | `PlayerPrefs` | `localStorage` or Tauri store plugin |
| On-screen keyboard | Windows `TabTip.exe`/`osk.exe` via P/Invoke | In-app React keyboard (**recommended**) or Tauri command shelling to TabTip |
| Image crop | Custom `ImageCropper` + GPU blit | Canvas 2D / `createImageBitmap` |

## Core user flow

```
Puzzle_Screen (launch/attract: board auto-shuffles once per second)
      │  tap START
      ▼
ImageSelectOrUploadScreen ── "Add from MAP's collection" ──▶ Browse_And_Discover_Screen
      │                                                              │ tap a card
      │  QR code scanned (socket "new-upload")                        ▼
      └──────────────────────────────────────────────────▶ Crop_Image_Screen
                                                                     │ Crop & Start
                                                                     ▼
                                                        Puzzle_Screen (gameplay)
                                                                     │ solved
                                                                     ▼
                                                                 WinScreen
                                                                     │ Play Again
                                                                     └─▶ new image, straight into gameplay
```

## Screens (8 roots per scene)

| Screen | State in scene | Purpose |
|---|---|---|
| `Puzzle_Screen` | active (start screen) | Board, timer, high score, footer controls |
| `ImageSelectOrUploadScreen` | inactive | Choose MAP collection vs QR upload |
| `Browse_And_Discover_Screen` | inactive | Search / filter / paginate the collection grid |
| `Crop_Image_Screen` | inactive | Pan / zoom / rotate → square crop |
| `WinScreen` | inactive | Best time, your time, Play Again |
| `QRScanScreen` | inactive, **disabled (`[X]`)** | Legacy — not in current flow |
| `Artwork Focus Screen` | inactive, **disabled (`[X]`)** | Legacy — bypassed by Crop → Start |
| `ProgressPanel` | inactive | Loading / progress overlay |

**Naming convention in the scenes:** the `[...]` prefixes are authoring markers, not code:
`[E]`/`[D]` = enabled/disabled at start, `[E/D]` = toggled at runtime, `[X]` = deprecated/unused.

## Brand constraints (MAP Brand Style Guide v1.0)

Colour palette — use these exact values:

| Name | Hex | Role |
|---|---|---|
| MAP Kohl | `#000000` | Primary |
| MAP Aamras | `#FFA300` | Secondary (amber — used for artwork titles/accents) |
| MAP Baingani | `#500778` | Secondary (purple) |
| MAP Ferozi | `#5CB8B2` | Secondary (teal) |
| MAP Sharbati | `#D50032` | Secondary (crimson) |
| MAP Gulabi | `#D0006F` | Secondary (magenta) |

Typography: **Geometria** for titles/buttons/signage; **Leitura News** for body copy only.
The shipping app currently uses **Conduit ITC** (Regular/Bold) after a font migration — see
[decisions.md](decisions.md). Both are **licensed** fonts: ship the licensed web formats
(`woff2`) with the port; do not substitute silently.

## Documents in this set

| Doc | Contents |
|---|---|
| [architecture.md](architecture.md) | Module map, data flow, proposed React/Tauri structure |
| [game-logic.md](game-logic.md) | Puzzle algorithms, state machine, API contract, persistence |
| [ui-spec.md](ui-spec.md) | Every screen, element geometry, animation sequences |
| [pixel-perfect-replication.md](pixel-perfect-replication.md) | The coordinate/scaling model + how to hit 1:1 parity |
| [ui/scene-portrait.md](ui/scene-portrait.md) | **Generated** full element dump (2160×3840) |
| [ui/scene-landscape.md](ui/scene-landscape.md) | **Generated** full element dump (3840×2160) |
| [roadmap.md](roadmap.md) | Phased port plan |
| [tasks.md](tasks.md) | Live task list |
| [decisions.md](decisions.md) | Architectural decision log |
| [ai_handoff.md](ai_handoff.md) | State for the next agent |

## Non-negotiables for the port

1. **Kiosk-safe**: no OS chrome, no way to exit to desktop, no browser UI. Tauri window:
   `decorations: false`, `fullscreen: true`, `alwaysOnTop`.
2. **Two orientations**: portrait and landscape layouts differ in element placement, not logic.
3. **Touch-first**: all hit targets sized for finger input; no hover-only affordances.
4. **Offline degradation**: the collection API can fail — the app must still be usable
   (Unity falls back to bundled local textures).
5. **No secrets in the repo**: see the security note in [game-logic.md](game-logic.md#security).

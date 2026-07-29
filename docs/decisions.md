# Decision Log

Architectural decisions, newest first. Each entry: context → decision → consequences.

---

## ADR-017 — The crop screen is a resizable square grid, not pan-and-zoom

**Date:** 2026-07-29 · **Status:** Accepted (corrects the docs)

**Context.** [game-logic.md §10](game-logic.md) and [ui-spec.md §6](ui-spec.md) describe the crop
screen as "pan / pinch-zoom via `PinchableScrollRect` + `ImageZoomController` (zoom slider; the reset
button is disabled once zoom < 0.99)". Building that would have been wrong twice over. In the scene:

* `Crop_Image_Screen` carries `ImageCropper`, `ImageZoomController`, `CropGridResizer` and
  `CropScreenController`. There is **no `PinchableScrollRect`**, so the image never pans or zooms.
* `ResetZoomButton` and `ZoomSlider` are children of **`[X]DisableButtons`, which is inactive** —
  they are authored but do not ship. The `[X]` prefix is the project's own "deprecated" marker.
* `CropGridResizer`'s own summary is explicit: *"Manages a resizable square crop grid with 4 corner
  drag handles."*

**Decision.** Implement what ships: the image is displayed fitted (`preserveAspect` →
`object-fit: contain`), and a **square** grid over it is resized by four corner handles and moved by
dragging its body, clamped inside the visible image. Ported behaviours:

* Grid starts as the largest square fitting the *visible* image, centred.
* A corner drag resizes about the **opposite** corner, which stays fixed.
* Size clamps to `[0.2 × initial, initial]` (`minSizeFraction = 0.2`).
* Handles are 80 px, white at alpha 0.9 (`handleVisualSize`, `handleColor`).
* Rotate ±90° over 300 ms linear, then the pixel rotation is **committed** — the board slices with
  `background-position`, which cannot express a rotation.

**Consequences.**
- Simpler and more testable than pan-and-zoom: the grid maths are pure functions in
  `src/image/cropGrid.ts` with 40 unit tests, and no gesture recogniser is needed.
- The export samples at full source resolution rather than display size, so a 1520 px board is not
  fed a 380 px crop.
- `docs/game-logic.md §10` and `docs/ui-spec.md §6` are annotated rather than rewritten, so the
  origin of the mistake stays visible.
- **Lesson, third time now:** the scene is the source of truth, and an `[X]` prefix or an inactive
  parent means "does not ship" (see also ADR-015).

---

## ADR-016 — The collection API needs OAuth *and* the key; the token is cached in Rust

**Date:** 2026-07-29 · **Status:** Accepted (verified against the live API)

**Context.** The first live request, sent with `?key=` exactly as documented in
[game-logic.md §8.2](game-logic.md), returned **HTTP 500**. Adding an
`Authorization: Bearer` token obtained from `oauth/token` made the same request return **200**.

The docs described the login step ([§8.3](game-logic.md)) but not that it is *required* — the Unity
code never sets the header, because `LoginHandler` hands the token to
`ServerCommunication.ViitorCloudToken` inside `API-Machanisam.dll` and the DLL attaches it to every
request. Reading only the C# gives no hint that the collection GET is authenticated.

The credentials are also not in source: they are serialized on the `LoginHandler` component in the
scene, as a `client_credentials` grant with empty `username`/`password`.

**Decision.**
- The Rust side performs the login and caches the bearer token behind a `tokio::sync::Mutex`, with a
  5-minute safety margin against the stated expiry. The lock is held across the network call so that
  several concurrent first requests produce one login, not several.
- `scripts/extract-api-config.ps1` now also pulls `MAP_OAUTH_*` out of the scene YAML.
- `scripts/check-api.ps1` performs login-then-fetch and reports status and response shape while
  printing no URL, key or token — so "is the API up?" never requires handling a secret.

**Consequences.**
- `client_secret` is now a second credential to protect, and it is in the Unity repo's history too.
  **Both it and the API key must be rotated.**
- Observed `expires_in` is 30 days, so this is effectively one login per boot; the refresh path
  exists but will rarely run. It is exercised by forcing an early expiry, not by waiting.
- A failed login degrades exactly like a failed fetch: the Puzzle screen falls back to the bundled
  offline artwork rather than showing an error.
- The first live request took ~8 s, which sets the spinner and timeout requirements.

---

## ADR-015 — Scene-serialized values, not C# initialisers, are the source of truth

**Date:** 2026-07-29 · **Status:** Accepted

**Context.** Building the Puzzle screen against the constants table in
[game-logic.md §11](game-logic.md) produced a board that was too large, gaps that were too tight and
arrows that were too big. The table was transcribed from the field initialisers in
`GameManager.cs`, but Unity **serializes the designer-tuned values into the scene**, and those
override the initialisers at runtime. Four constants differ:

| Constant | `GameManager.cs` default | Portrait scene | Landscape scene |
|---|---:|---:|---:|
| `boardPaddingFactor` | 0.9 | **0.704** | **0.68** |
| `tileSpacing` | 2 | **6** | **6** |
| `shuffleMoveMultiplier` | 3 | **1** | **1** |
| `arrowSizeFactor` | 0.38 | **0.35** | **0.35** |

Consequences of the last one: `max(12, 3×3×1)` is **12** shuffle moves, not 27.

Two more values were missing from the docs entirely:

* `boardPanelPosition` — portrait `(0, 514)`, landscape `(0, 100)`. Unity Y is up, so the portrait
  board sits 514 px **above** centre.
* The `Outline` uses `SetFullStretch(rt, tileSpacing)`, and that helper sets
  `offsetMin = (−m, −m)` / `offsetMax = (+m, +m)`. The outline therefore extends `tileSpacing` px
  **outward** on every side — a border around the board, not the inset the docs implied.

**Decision.** `src/game/constants.ts` carries the **scene** values, keyed per orientation in
`BOARD_TUNING`, with the divergence documented at the top of the file and asserted in
`board.test.ts`. `game-logic.md §11` is annotated rather than silently rewritten, so the origin of
the confusion stays visible.

**Consequences.**
- Phase 1 constants and every Phase 2 geometry call had to be corrected; tests were updated to the
  scene values and still pass (144 total).
- **Any future constant must be read from the scene YAML, not from the C# initialiser.** A
  `[SerializeField]` initialiser is only the value a *new* component gets.
- Tuning is per-orientation, so landscape (Phase 6) picks up its own padding factor with no code
  change.

---

## ADR-014 — The scaled canvas is fixed at reference size, so off-aspect displays clip

**Date:** 2026-07-29 · **Status:** Accepted

**Context.** Asked whether the app is resolution-independent. It is, on the kiosk's aspect ratio —
but the fixed-canvas model and Unity's canvas differ off-aspect, and that difference should be
written down rather than discovered later.

Unity's canvas `RectTransform` is sized `screenSize / scaleFactor`, so on a display whose aspect
ratio differs from the reference the canvas takes the *display's* aspect and fractional-anchor
(Idiom A) elements re-spread across it. Our `ScaledCanvas` is a fixed 2160×3840 rect, so the same
display letterboxes on one axis and clips on the other.

**Decision.** Keep the fixed reference-size canvas, as prescribed by
[pixel-perfect-replication.md §1](pixel-perfect-replication.md) and ADR-007.

**Consequences.**
- **Any 9:16 resolution is pixel-identical** — verified 0 px error at 1080×1920, 1440×2560 and
  2160×3840. This covers the kiosk hardware (2160×3840 portrait) and every same-aspect fallback.
- An off-aspect display (e.g. a 16:9 dev laptop) shows a centred, clipped canvas rather than a
  re-spread layout. Acceptable: the target hardware is fixed, and clipping is honest — it makes the
  mismatch visible instead of silently producing a layout that does not exist on the kiosk.
- Geometry tables stay predictable during Phase 2: percentages resolve against a constant rect, so
  a value copied from the scene dump means one thing, always.
- **If off-aspect support is ever needed**, the change is small and local: size the canvas
  `viewport / scaleFactor` instead of from the reference constant, inside `ScaledCanvas` only. At
  matching aspect that reduces to exactly the current behaviour, so it is a safe swap.

---

## ADR-013 — Conduit ITC is the only typeface; brand palette is authoritative

**Date:** 2026-07-29 · **Status:** Accepted (client directive)

**Context.** Two open questions blocked Phase 2: which font (Q4) and which of the near-amber
colours is correct (Q1–Q3). The MAP style guide names Geometria + Leitura News, the shipping build
uses Conduit ITC, and the code sets `#DCB63C`/`#E7B639` where the brand palette says `#FFA300`.

**Decision.** Client answered both:
- **Conduit ITC Regular + Bold only.** Geometria and Leitura News are out of scope. Licensing is
  the client's call and is not a port blocker.
- **The brand palette is authoritative** (`docs/brand-color/Brand-color.png`, identical to the
  table in [project-overview.md](project-overview.md)). Artwork title and caption become
  **`#FFA300`** (MAP Aamras).
- `#67797F` (high-score badge tint) has no brand equivalent — the palette contains no neutral
  grey — so it is **kept as-is** and exposed as `--colour-highscore-badge`.

**Consequences.**
- Q1–Q4 in [tasks.md](tasks.md) are resolved. Phase 2 is unblocked on both counts.
- Brand amber and Unity amber differ, so those elements **cannot** pass a raw pixel diff against
  the Unity capture. Resolved by ADR-010 (colour-mode switch), not by compromising the brand.
- Fonts are generated from the Unity `.otf`/`.ttf` sources by `npm run build:fonts`. The Unity
  `.asset` SDF atlases are never used.

---

## ADR-012 — Kiosk window mode is applied at runtime, not in `tauri.conf.json`

**Date:** 2026-07-29 · **Status:** Accepted

**Context.** A window declared `fullscreen + decorations:false + alwaysOnTop` in the config is
correct for the kiosk and hostile during development: `tauri dev` covers the developer's editor on
every reload, and a renderer crash leaves an undecorated always-on-top window that can only be
cleared by killing the process.

**Decision.** `tauri.conf.json` declares a **windowed, decorated** 1080×1920 window.
`src-tauri/src/kiosk.rs` promotes it to fullscreen / undecorated / always-on-top / non-resizable at
startup when either the build is a release build or `MAP_KIOSK=1` is set.

**Consequences.**
- Packaged builds are always locked down — the operator cannot forget a flag.
- Kiosk mode is still testable on demand during development.
- Promotion failures are logged, never fatal: a kiosk that opens windowed is recoverable by staff;
  one that fails to open is not.
- The staff exit hatch is on the JavaScript side (`src/kiosk/exitHatch.ts`) and is installed
  **before React renders**, so it survives a renderer that fails to mount.

---

## ADR-011 — WebView2 ships as an offline installer inside the bundle

**Date:** 2026-07-29 · **Status:** Accepted

**Context.** Tauri needs the WebView2 runtime on the target machine. Tauri's default
(`downloadBootstrapper`) fetches it during installation, which assumes internet access at install
time on the kiosk.

**Decision.** `bundle.windows.webviewInstallMode = { "type": "offlineInstaller" }`, NSIS target,
`perMachine` install mode.

**Consequences.**
- Installation works on a gallery machine with no network — the realistic case.
- The installer grows by roughly 130 MB. Acceptable: it is deployed by hand, not downloaded by
  visitors.
- `perMachine` requires an elevated install, which suits a kiosk that must start before login.

---

## ADR-010 — Colour mode switch so brand and pixel parity can both be verified

**Date:** 2026-07-29 · **Status:** Accepted

**Context.** ADR-013 makes the brand palette authoritative, which means two elements deliberately
differ from the Unity build (`#FFA300` vs `#DCB63C`/`#E7B639`). Diffing the port against a Unity
capture would then report a *false* geometry failure on the artwork title and the caption, and the
1 % budget in [pixel-perfect-replication.md §9](pixel-perfect-replication.md) would be unusable as
a phase gate.

**Decision.** All colours are CSS custom properties in `src/styles/tokens.css`. The default
(brand) values ship. Setting `data-color-mode="unity"` on `<html>` overrides the two amber tokens
with the legacy Unity values, for parity runs only.

**Consequences.**
- Geometry parity stays measurable independently of a deliberate colour change.
- A brand review remains a one-file edit.
- Risk: someone ships with `data-color-mode="unity"` set. It is set nowhere in application code —
  only by the parity procedure — and the attribute is absent from `index.html`.

---

## ADR-009 — API credentials live in a gitignored `src-tauri/.env`, extracted by script

**Date:** 2026-07-29 · **Status:** Accepted

**Context.** `Scripts/API/API.cs` in the Unity repo hardcodes the collection API key, which is
therefore in that repository's git history. The port must not repeat the pattern, and moving the
value by hand invites pasting it into a chat log, a commit, or CI output.

**Decision.**
- `scripts/extract-api-config.ps1` reads `API.cs` and writes `src-tauri/.env`. It prints variable
  **names and character counts only** — never values.
- `.env` is gitignored; `src-tauri/.env.example` documents the shape.
- The key is read by the **Rust side only**. Collection requests go through the `collection_fetch`
  command (Phase 3), so the key never reaches renderer JS or DevTools.
- The Tauri capability set grants the renderer window control and nothing else.

**Consequences.**
- The key cannot be read from the packaged front-end bundle or the web view.
- **The existing key must still be rotated** — it is already in the Unity repo's history, and no
  change here can retract it. Tracked as U5 in [tasks.md](tasks.md).
- OAuth login credentials are *not* in code: they are serialized on the `LoginHandler` component in
  the Unity scene. `MAP_OAUTH_*` must be filled in by hand if the port reproduces the login step.

---

## ADR-008 — Port target is React + Tauri (not Electron, not a web app)

**Date:** 2026-07-29 · **Status:** Accepted (client directive)

**Context.** The kiosk must ship as a Windows `.exe`. The existing Unity build is heavy to iterate
on for UI work, and the UI is the part changing most often (brand pass, layout tuning).

**Decision.** Port to **React + TypeScript** in a **Tauri v2** shell.

**Consequences.**
- Much faster UI iteration; brand changes become CSS-token edits.
- Tauri gives a small binary and a Rust side we can use to keep the API key out of the renderer.
- Loses Unity's rendering determinism → pixel parity must be **enforced by measurement**
  ([pixel-perfect-replication.md §9](pixel-perfect-replication.md#9-verification--prove-parity-dont-eyeball-it)).
- Game logic must be rewritten in TS; keeping it pure makes it unit-testable (an improvement).

---

## ADR-007 — Single scaled canvas instead of responsive CSS layout

**Date:** 2026-07-29 · **Status:** Accepted

**Context.** Unity lays out in a fixed reference resolution (2160×3840 / 3840×2160) and applies one
uniform scale factor. Rebuilding that as fluid/responsive CSS would guarantee drift from the
original geometry, and the target is fixed-resolution kiosk hardware anyway.

**Decision.** Render the whole UI at reference size inside one wrapper with
`transform: scale(factor)`, where `factor = sqrt((sw/rw) × (sh/rh))` (Unity's `match = 0.5`
geometric mean).

**Consequences.**
- Unity numbers can be used **verbatim** — no per-element conversion, no rounding drift.
- One place to reason about scaling.
- Text scales as a unit (matches SDF behaviour) but won't respect OS font-size accessibility
  settings — acceptable for a fixed kiosk, would not be for a public web app.
- Must use `transform: scale()`, not `zoom` (which re-runs layout and rounds to integers).

---

## ADR-006 — Ship an in-app on-screen keyboard, not the Windows one

**Date:** 2026-07-29 · **Status:** Accepted (recommendation for the port)

**Context.** The Unity app launches the Windows keyboard. Extended investigation found:
- `osk.exe` has **no per-app skin control** and did **not** follow the Windows light theme even
  with `AppsUseLightTheme = 1` — it stayed black, which the client rejected.
- `TabTip.exe` (touch keyboard) *does* have its own theme (`TabletTip\1.7\SelectedThemeName`) and
  can be forced white, but it is a **shared OS host**: no process-level open/close signal, so app
  state had to be inferred from window visibility (incl. DWM cloaking), and `ITipInvocation.Toggle`
  is a blind flip that double-fired, causing open→close and blinking.
- Both keyboards render as separate OS windows with their own close/minimise affordances — a
  kiosk-escape risk.

**Decision.** For the port, implement the keyboard **inside the app** (React component).

**Consequences.**
- Full control of skin (guaranteed white/brand), size, layout, and open/close events.
- No registry writes, no COM, no UAC, no OS-version fragility, no kiosk escape.
- Costs implementation effort (layout, key repeat, shift/symbols) — worth it: every keyboard defect
  in this project traced to not owning the keyboard.

---

## ADR-005 — Footer button labels/icons dim via one code choke point

**Date:** 2026-07-29 · **Status:** Accepted (implemented in Unity)

**Context.** Unity's `Button` tints only its own target graphic on disable; child text and icons stay
at full opacity, so disabled buttons looked enabled. A first attempt added a per-button component via
an editor menu item, which was never run — the components never existed in the scene and the change
silently did nothing.

**Decision.** Apply label + icon alpha in `UIManager.SetFooterButtonInteraction()` — the single place
that already sets `interactable`. Alpha **0.3** disabled, **1.0** enabled (RGB preserved).

**Consequences.**
- Works across every flow (`Initialize`, `EnterLaunchMode`, `ExitLaunchMode`) with **no scene edits
  and no manual setup step**.
- Lesson recorded: *prefer changes that take effect from existing code paths over changes requiring a
  human to run an editor action.*

---

## ADR-004 — Press feedback offsets label + icon, scene-attached

**Date:** 2026-07-29 · **Status:** Accepted (implemented in Unity)

**Context.** Buttons use Sprite Swap, which changes only the background; contents didn't move, so
presses felt flat. The component was initially attached at runtime, making it invisible/untunable in
the Inspector.

**Decision.** `ButtonPressOffset` **attached in the scene** (via `Tools ▸ MAP ▸ Setup Button Press
Effect`), offset `(−10, −10)` px, applied to `button-text` + `icon`.

Press state mirrors Unity's `isPointerDown`: applied on pointer-down, released **only** on
pointer-up (which is delivered even if released off the button). Deliberately **no**
`IPointerExitHandler` — `Selectable` keeps the pressed sprite while held after the pointer leaves, so
releasing the offset on exit desynced the text from the background.

**Consequences.** Contents and sprite stay in sync in every pointer path; offset tunable per button.
Port equivalent is CSS `:active` (or `pointerdown`/`pointerup` + `setPointerCapture` — never
`pointerleave`).

---

## ADR-003 — Font migration to Conduit ITC

**Date:** 2026-07-27 · **Status:** Accepted (in progress)

**Context.** Scenes mixed `Geometria-Bold`, `Geometria-Regular` and the non-brand
`ArchivoNarrow-Regular`. The MAP style guide specifies Geometria (display) + Leitura News (body);
the client supplied **Conduit ITC** instead.

**Decision.** Map `Geometria-Bold → ConduitITC-Bold`, `Geometria-Regular` **and**
`ArchivoNarrow-Regular → Conduit ITC Regular`, applied by `Tools ▸ MAP ▸ Swap Fonts`.

The swap assigns via `TMP_Text.font` (which also assigns the matched default material) rather than
rewriting scene-file GUIDs, because a raw GUID swap leaves the material pointing at the old font's
atlas.

**Consequences.**
- Divergence from the written style guide — **needs client confirmation** (task Q4).
- Portrait scene migrated; Landscape pending.
- Port must ship licensed Conduit ITC `woff2`.

---

## ADR-002 — Screen transitions must fail safe

**Date:** 2026-07-29 · **Status:** Accepted (implemented in Unity)

**Context.** The Start button intermittently stopped responding. Root cause: `ScreenManager`'s
DOTween cross-fade could be interrupted after the mid-sequence screen swap but before its final
callback (e.g. an exception in an incoming screen's `OnEnable`, which DOTween safe-mode swallows).
That left `fadeOverlay.blocksRaycasts = true` (an invisible full-screen click blocker) **and**
`_isTransitioning = true` (so later navigation silently no-oped) — one cause, both symptoms.

**Decision.** Guard the screen swap so a throwing `OnEnable` can't abort the sequence; run cleanup on
both `OnComplete` **and** `OnKill`; `SetUpdate(true)` so `timeScale` can't freeze it; plus a
`LateUpdate` safety net asserting the overlay never blocks while not transitioning.

**Consequences.** Self-healing transitions. **Port requirement:** model the transition as explicit
state with a timeout fallback, and derive `pointer-events` from that state in exactly one place.

---

## ADR-001 — Move-based shuffle (never index permutation)

**Date:** pre-existing · **Status:** Accepted

**Context.** A random permutation of tiles is unsolvable ~50 % of the time for a sliding-tile board,
requiring an inversion-parity correction.

**Decision.** Shuffle by performing N random **legal moves** from the solved state
(N = `max(12, cols × rows × 3)` = 27 for 3×3), avoiding immediate reversals, re-shuffling if the
result is solved.

**Consequences.** Solvability is guaranteed by construction — no parity maths. Must be preserved in
the port. (Improve one thing: bound the "if solved, reshuffle" recursion.)

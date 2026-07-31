# Decision Log

Architectural decisions, newest first. Each entry: context → decision → consequences.

> **Numbering note.** ADR-026 was used TWICE (the Unity-EXE design pass, below, and
> "Arrow Layer Ordering Behind Tiles", further down). ADR-027 … ADR-040 were also
> appended at the BOTTOM of this file rather than the top, so "newest first" holds
> only for ADR-041+ and ADR-026 … ADR-001. Numbers are not reused going forward.

---

## ADR-046 — Kiosk fullscreen and always-on-top are re-asserted, not set once

**Date:** 2026-07-31 · **Status:** Accepted · **Extends:** ADR-012

**Context.** The client's final requirement for both installers: always fullscreen,
always in front of every other app, on 4K panels — 3840×2160 landscape and
2160×3840 portrait.

Two of the three already held. ADR-012's `kiosk.rs` promotes the window to
fullscreen / undecorated / non-resizable / always-on-top in any release build, and
the reference resolutions are exactly the two 4K sizes, so `computeScaleFactor`
returns **1.0** on a native 4K panel — the UI is 1:1 with no scaling. Both are
asserted in `reference.test.ts`.

The gap was lifetime. `kiosk::apply` ran **once**, in `setup`. On Windows
`HWND_TOPMOST` is surrendered whenever another process claims the top slot — another
app going fullscreen, a UAC prompt, an Explorer restart, some installers and screen
savers — and fullscreen itself can be dropped by a display or resolution change. So
"always in front" held only until the first such event, after which the kiosk sat
behind something with no staff present. Exactly the class of failure ADR-024's
watchdog exists for, except a covered window is still a live process, so the
watchdog cannot see it.

**Decision.** Add `kiosk::reassert`, called from an `on_window_event` handler on
`WindowEvent::Focused(false)` and `WindowEvent::Resized(_)` — the two events those
losses arrive as. It re-applies always-on-top unconditionally and fullscreen only
when `is_fullscreen()` reports it was lost, so the common case is a no-op and it
cannot recurse through the `Resized` event that setting fullscreen emits. Gated on
the same `kiosk_requested()` check, so `tauri dev` is untouched.

`lock_down` also now logs the display it landed on — physical size, DPI scale and
name.

**Consequences.**
- Applies to **both installers** identically: one binary, one code path, orientation
  only changes `productName`/`identifier` and the dev window (ADR-020).
- **It deliberately does NOT call `set_focus()` on focus loss.** Grabbing focus back
  every time fights UAC and system dialogs and can leave a machine that is very hard
  to service. Topmost is sufficient — a tap lands on the kiosk and brings focus with
  it, so the staff double-Esc still works. This is the deliberate limit on "always in
  front": the window is always *on top*, not always *focused*.
- The monitor log makes two otherwise-identical-looking faults a one-line diagnosis:
  fullscreen on the wrong display (the window starts centred on the PRIMARY monitor
  and `set_fullscreen` fills whichever it is on), and a 4K panel actually running a
  scaled-down desktop resolution.
- **DPI scaling is self-correcting and needs no code.** At 200 % Windows scaling on a
  3840×2160 panel the webview reports `innerWidth` 1920, so the scale factor is 0.5
  and the 3840×2160 reference canvas renders to 1920×1080 CSS px — filling the
  viewport — which WebView2 then paints at 2× into 3840×2160 physical pixels. Sharp
  and correct. The aspect ratio is what matters, not the absolute number.
- Verified by `cargo check`; **not launched.** Starting a fullscreen always-on-top
  window would take over the developer's display, so on-hardware confirmation is
  `MAP_KIOSK=1 npm run tauri:dev` plus the new log line (tracked with P6.10).

---

## ADR-045 — One owner for the board's artwork, behind a build scrim

**Date:** 2026-07-31 · **Status:** Accepted · **Supersedes:** ADR-043

**Context.** The artwork title appeared only *sometimes* — the client had two
screenshots of the same piece, "Ram with Sita, Lakshman and Hanuman (Ram Darbar)",
one titled and one not. `check-api.ps1` confirmed that is literally the first item
of collection page 1, so it was a real collection artwork in both, not a bundled
fallback.

Two compounding defects, neither of them in the title element itself (which
measures correct: 62 px, `#FFA300`, 100 px band 10 px above the board):

1. **Two owners of one piece of state, racing.** ADR-043 loaded the bundled image
   in one effect and swapped in a collection piece from a second. Both called
   `setArtwork` and dispatched `BUILD`. The bundled load *always* carries a
   title-less identity, so whenever it settled second it wiped the name off a good
   collection artwork. It settled second often, because the warm Rust caches
   (ADR-025, ADR-030) return a cached page in ~1 ms while cropping a bundled JPEG
   on a canvas does not — so the "slow" path frequently won. Cold cache → title;
   warm cache → no title. Hence the intermittency.
2. **`RESET_TO_LAUNCH_MODE` returns `INITIAL_GAME_STATE`**, which clears
   `identity`, while `artwork` is React state and survives. Home therefore left the
   picture on screen with no name until a rebuild finished.

A third, smaller one: the random pick could land on a record whose `title` is
empty, which looks identical to the bug.

**Decision.**
- **One effect owns the artwork.** It awaits `loadRandomArtwork()`, which now tries
  the collection FIRST and degrades to the bundled set on any failure. The second
  effect is deleted, along with its `attractRef` guard.
- **A build scrim** (`ui/LoadingOverlay`, the ADR-032 sprite sheet) covers the
  screen from the moment a build starts until the artwork, board and title are all
  in place. This is what buys back the wait that ADR-028 was avoiding: the visitor
  sees honest progress instead of a board that changes under them.
- **The picker prefers titled records**, falling back to any playable item if a
  whole page is untitled.

**Consequences.**
- Verified: **8 consecutive rebuilds, 0 blank titles**, alternating a 1 ms (warm)
  and 400 ms (cold) collection response — the exact condition that produced the
  race. The untitled fixture was never chosen. The scrim always cleared.
- **ADR-028's 0 ms boot is given up on purpose.** Boot now waits for the
  collection (~8 s cold, ~1 ms from the 24 h disk cache) behind the scrim. That was
  the client's explicit request: show a loading screen until the puzzle and its
  name are ready.
- The scrim lifts in a `finally`, so a failed load cannot leave a spinner up
  forever — staff keep their exit gesture.
- `LoadingOverlay` duplicates the sprite-sheet keyframes that `BrowseScreen` also
  has. Left duplicated: Browse's overlay additionally blurs the grid and disables
  the page arrows, a different job. Worth folding together on a third caller.

---

## ADR-044 — One radius token, and rounded control plates are drawn in CSS

**Date:** 2026-07-31 · **Status:** Accepted

**Context.** The client asked for the high-score badge and the timer to share the
footer buttons' corner radius. They were the two extremes on that row: the badge
was a **full pill** and the timer was **nearly square**, with the buttons between
them. Both are drawn from Unity art the port cannot restyle — the badge through a
9-sliced `Circle_9Sliced.png` mask, the timer as `timer-background.svg`.

**Decision.**
- **`--radius-control: 32px`** in `tokens.css` is the one radius for every control
  the port draws itself. The number is taken from the button art rather than
  invented: `reset-button.svg` is 215×89, its coloured face has a 16-unit corner,
  and portrait renders it into a 430×178 rect — exactly 2× — so the face corner
  lands at 32 reference px.
- **The badge drops the mask.** The shape under it was a plain rectangle; the mask
  only ever supplied the pill. It is now a solid tint plus the token. Landscape
  already drew it flat (ADR-019), so the two orientations finally agree.
- **The timer plate is CSS, not the sprite.** `timer-background.svg` is two layers
  — a ~3-unit `#FEFFFE` frame around an `#88A35C` fill — reproduced as a
  background plus a border, so the radius is ours to set. Clipping the sprite with
  `overflow: hidden` was rejected: it cuts the white frame at the corners.

**Consequences.**
- Verified at 540×960: badge and timer both computed `border-radius: 32px`, timer
  `rgb(136,163,92)` behind a `4px solid rgb(254,255,254)` border.
- `timer-background.svg` and `circle-9sliced.png` are now unreferenced by the
  Puzzle screen. Left in `public/assets` deliberately — they are the Unity record
  of these two colours, and `copy-assets.ps1` still lists `circle-9sliced`.
- Border width is 4 ref px portrait, 3 landscape, because the landscape timer is
  rendered near 1:1 with the sprite while portrait renders it at ~1.6×.
- **The footer button sprites are untouched.** Only the two CSS-drawn plates moved.

---

## ADR-043 — Attract mode upgrades to a titled collection artwork in the background

**Date:** 2026-07-31 · **Status:** SUPERSEDED by ADR-045, same day

> **Why it failed.** The background upgrade gave two effects ownership of one piece
> of board state, and they raced. The bundled load always carries a title-less
> identity, so whenever it settled second it wiped the title — which the warm Rust
> caches made common. Read ADR-045; do not reinstate this shape.

**Context.** The client asked to see the artwork name whenever a puzzle is built.
It showed during gameplay reached through Browse but never on the home screen.

The mechanism was never broken — the title element matches Unity exactly (62 px,
`#FFA300`, a 100 px band 10 px above the board, verified live). The gap was the
*source*: ADR-028 made boot load only the bundled offline images to kill a 12–15 s
launch hang, and those three images carry **no title**. Unity has no such gap —
`GameManager.OnAPIDataForLaunch` loads launch mode from the API and takes
`chosen.title`, so its attract board is a titled collection piece.

So the port had to choose between ADR-028's instant boot and Unity's titled attract
board. Naming the three bundled images was rejected: their real titles are not in
the repo and inventing them would put fabricated attributions on a museum kiosk.

**Decision.** Do both, in order. The bundled image still loads first and is
playable at 0 ms. A second effect then fetches a random collection artwork
(`loadCollectionArtwork`) and swaps it in **only while still in attract mode**,
guarded by a ref because the load resolves long after its effect closed over
state. Any failure keeps the bundled image and logs one line.

**Consequences.**
- Verified with a stubbed collection: the home screen shows the artwork title with
  START still visible, i.e. attract mode, not gameplay.
- **Offline the home screen still has no title**, and that is the correct
  behaviour — it is exactly what Unity shows for a local texture.
- The swap rebuilds the board. Harmless in attract mode, which is auto-shuffling
  anyway, and it cannot touch a game in progress.
- Boot now issues a collection request it did not before. It is off the critical
  path, and the 24 h Rust disk cache (ADR-030) makes it ~1 ms after the first run.
- The catch **logs**. A silent catch here would hide a real fault behind nothing
  but a missing title — which is precisely how this went unnoticed.

---

## ADR-042 — The Sort By control is an in-canvas dropdown, never a native `<select>`

**Date:** 2026-07-31 · **Status:** Accepted

**Context.** Sort By shipped as a native `<select>`. The reasoning recorded in the
CSS was that its five options are short and fixed, so the OS could draw the popup
and clipping would never be a concern. On a kiosk that reasoning is inverted: the
OS popup is **not inside `<ScaledCanvas>`**, so it ignores the canvas transform
entirely.

Two defects followed, both visible in the client's landscape screenshot:

1. **Option rows rendered at OS size.** Everything else on the screen is drawn at
   reference scale and then scaled down (~0.28 at 1080p landscape); the popup was
   not, so its rows were roughly 4x the height of the filter dropdowns beside it.
2. **Two popups could be open at once.** The native popup is positioned by the OS
   and has no knowledge of `openDropdown`, so it opened over the already-open Date
   filter popup.

**Decision.** `SortDropdown.tsx` — a panel built from the same CSS classes as
`FilterDropdown`, rendered inside the scaled canvas, and joined to the **shared
`openDropdown` state** so at most one popup exists at any time. No search row: five
fixed options need no filtering, so the popup is sized to its content
(`SORT_MODES.length × popupRowHeight`) instead of the filters' fixed 400 px.

**Consequences.**
- Sort rows are the same size as filter rows, because they are literally the same
  classes and the same `filterDropdowns.label.fontSizePx`.
- Opening Sort closes any filter popup and vice versa — verified at 540×960: after
  tapping Date then Sort, `aria-expanded` is `false` on Date, `true` on Sort, and
  exactly one `dropdownPopup` node exists.
- **General rule: no native form control that renders its own popup may be used
  inside `<ScaledCanvas>`.** `<select>`, `<datalist>` and the date/colour pickers
  all draw chrome the canvas transform cannot reach. Plain `<input>` is fine — it
  is the *popup* that escapes, not the field.

---

## ADR-041 — The high score is global, not per artwork (diverges from Unity)

**Date:** 2026-07-31 · **Status:** Accepted (client directive)

**Context.** Unity keys the record per image —
`GameManager.GetHighScoreKey()` (`Scripts/GameManager.cs:1221-1227`) builds
`{productName}_HighScoreKey_{artworkTitle | textureName | "Default"}`. The port
reproduced that key shape byte for byte so existing kiosk records could migrate.

The client reviewed the behaviour on 2026-07-31 and called the Unity logic wrong.
It is also self-contradictory: the comment immediately above that method
(`GameManager.cs:1217-1220`) states that "a single app-wide high score is
intentional here", which the code does not do.

Two further consequences of the per-artwork key argue the same way. A visitor could
never beat a record set on a different picture, so the badge was effectively always
`--:--` for anyone playing a new artwork. And because untitled sources fall back to
a *fixed* texture name, every QR upload silently shared one bucket
(`..._HighScoreKey_CroppedImage`) while every titled artwork got its own.

**Decision.** One key for the whole game: `{productName}_HighScoreKey`.
`highScoreKey`, `readHighScore` and `writeHighScoreIfFaster` no longer take an
identity. The kiosk runs one fixed 3×3 difficulty, so every run is comparable and a
single board to beat is the sensible reading.

`ArtworkIdentity` survives but moved to `game/types.ts`: it is now display-only
data, feeding the artwork title above the board. Nothing is keyed on it.
`resolveIdentifier` is deleted.

**Consequences.**
- **No migration; the badge reads `--:--` once after this ships**, then rebuilds.
  Old per-artwork keys are orphaned rather than deleted — `KeyValueStore` is
  `getItem`/`setItem` only, so folding them into a single minimum would need a
  wider storage interface for a one-off gain.
- The write rule is unchanged: strictly faster wins, an equal time does not
  overwrite, `-1` renders `--:--`.
- Tests: 310 green. The per-artwork independence test is replaced by its opposite —
  two runs on different artworks now share one record, and the slower one does not
  overwrite the faster.
- Divergence from Unity is deliberate and client-directed. Do not "fix" it back by
  reading `GetHighScoreKey()`.

---

## ADR-026 — Design corrections from the Unity EXE screenshots

**Date:** 2026-07-30 · **Status:** Accepted

**Context.** The client supplied seven screenshots of the running Unity build
(Home, ImageSelect/QR, Browse, Crop, Crop-rotate, image-selected, Preview) for a
design pass. The port was driven through every screen at 540×960 and compared.
Most screens matched; the corrections below are the ones that did not, plus two
divergences the client chose to keep.

**Decisions (corrections).**
- **Arrow pulse direction.** The idle pulse used `scale: 1→1.06` while the arrow
  was positioned with `transform: translate3d(x,y)`. By the CSS transform order
  the scale multiplied the position offset from the board origin, so every arrow
  drifted toward the bottom-right instead of pulsing in place. Fixed: position by
  `left`/`top` and give each arrow a **direction-matched** translate pulse
  (`arrow-up` pulses up, etc.), travel from `--arrow-pulse-shift`.
- **GridViewButton restored.** The port had dropped it (P3.11 — one view, no
  option list). The client wants it shown, so it renders the scene's `GridView.png`
  at its serialized rect (60² portrait / 45² landscape, right of Sort By),
  **visual only** — it switches nothing.
- **ImageSelect label containment.** "Add from MAP's collection" spilled below the
  card because the Unity label's `ContentSizeFitter` is not reported by
  `extract_ui.py`, so `labelRect` came through as `size (0,0)` and the flex box
  collapsed to zero width. Sized to a real centred box below the icon in both
  orientations.
- **ImageSelect QR.** Removed the white circular pill (a `circle-9sliced` mask)
  and the offline dim + "Upload is offline" notice. The QR sprite is
  black-on-transparent, so it now sits on a plain white **square**, always clean.

**Decisions (kept, diverging from the screenshots on purpose).**
- **The MAP logo stays** top-centre (portrait) / top-right (landscape). The
  screenshots show no logo and the scene marks it active; the client chose to keep
  it. One reversible switch was scoped but not applied.
- **Collection card captions stay** (title + accession under each card). The Unity
  cards are image-only; the client chose to keep the captions.

**Consequences.**
- The **running-build screenshots are now a source of truth** alongside the scene
  YAML and the runtime code. Two of these (the master image host and the OAuth
  403, ADR-025) were only visible once the app was driven end to end against the
  live API — a stub had hidden them.
- **`KEEP_ARROWS_VISIBLE_FOR_TESTING` is ON** in `Board.tsx` at the client's
  request (arrows stay visible during a slide / preview / after a win, for
  testing). Flip it to `false` to restore the Unity behaviour before shipping.
- Verified at 540×960: arrow positions no longer drift; the grid button renders at
  60 ref px at the bar's right edge; the ImageSelect label sits inside the card on
  both axes and the QR is a clean white square. Some checks were by DOM
  measurement rather than screenshot when the browser pane would not composite.

---

## ADR-025 — Artwork images are fetched through Rust and cached under app data

**Date:** 2026-07-30 · **Status:** Accepted (verified against the live API)

**Context.** Two image defects surfaced once the collection was driven against the
live API rather than a stub:

1. **The full-resolution master was an unreachable host.** `primary_image` is
   served from `static.cumulus.co.in`, which was not in `image_fetch`'s host
   allow-list, so every full-res fetch was rejected as a bad host. Card previews
   worked only because they loaded ImageKit (`ik.imagekit.io`) straight through an
   `<img>`, bypassing the allow-list.
2. **A reduced-scope token → HTTP 403 on the collection.** The hand-edited
   `.env` (Unity absent, so the generator could not run) had
   `MAP_OAUTH_SCOPE=read-artwork read-department` **unquoted**. `dotenvy` stops at
   the first unquoted space, so the app logged in without the scope (token 1263 vs
   1306 chars) and the collection endpoint answered **403**. `check-api.ps1` has
   its own parser that tolerated the space, which masked the fault at 200. This is
   the ADR-016 trap a second time.

**Decision.**
- Add `cumulus.co.in` to `ALLOWED_IMAGE_HOSTS` (covers `static.cumulus.co.in`).
- `image_fetch` now **caches to app data**: the URL is hashed to
  `%LOCALAPPDATA%\<identifier>\image-cache\<hash>.<ext>`; a hit is served from disk
  without touching the network, a miss is downloaded then written (temp file +
  rename, so a crash cannot leave a truncated file served as valid). It backs both
  the low-res grid previews (ImageKit **w600**, ~90 KB) and the full-resolution
  master loaded when a card is opened (~4–7 MB) — distinct URLs, cached
  independently.
- `ArtworkCard` loads its preview through `image_fetch` (a cached blob, revoked on
  unmount) instead of a raw CDN `<img>`, so previews are cached too and go through
  the one image path.
- The `.env` fix is to **quote** the scope value. It is not a code change; a
  `.env` with a spaced, unquoted value must be quoted (the generator already does
  this).

**Consequences.**
- Verified live: login token back to 1306 chars, collection **200**, and a boot
  fetch wrote a **3.9 MB** master to the cache dir; a second fetch of the same URL
  is served from disk. Front-end build, `cargo check`, vitest (308) all green.
- **No eviction yet.** Previews are tiny; masters are cached only when opened. A
  months-long kiosk run should add a periodic cache-size cap (tracked below).
- Pure-browser dev (no Tauri, no stub) no longer shows previews, since they route
  through Rust. The kiosk and the stubbed dev harness are unaffected.
- **The running build beats the stub, again.** The 4K-master host and the 403 were
  both invisible until the live API was driven end to end — a stubbed render had
  hidden them.

---

## ADR-024 — Auto-start and crash-restart: a logon scheduled task drives an external watchdog

**Date:** 2026-07-30 · **Status:** Accepted

**Context.** The kiosk must launch the app on boot and bring it back if it dies,
with no staff present. This is P6.11 / B6, and the only Phase-6 item that can be
built and tested without the kiosk hardware. Two things have to be true: the app
starts by itself, and a crash does not leave a black screen until Monday.

**Decision.** Two layers, both outside the app (see `scripts/kiosk/`):

```
scheduled task (at logon)  --runs-->  kiosk-watchdog.ps1  --launches-->  app
        (backstop: restart-on-failure)      (relaunch on crash)
```

- **Auto-start is a Scheduled Task** triggered at logon, RunLevel Highest, no
  execution-time-limit, `restart on failure` as a backstop for the watchdog
  process itself. `install-autostart.ps1` registers it (idempotent, `-DryRun`);
  `uninstall-autostart.ps1` removes it.
- **Crash-restart is a separate watchdog process** (`kiosk-watchdog.ps1`): launch
  the app, wait for exit, decide, repeat. It must be external — a restart
  mechanism *inside* the app cannot restart the app once the app's process is
  gone.
- **The relaunch decision is one pure function**, `Get-RestartDecision` in
  `KioskPolicy.ps1`: exit code `0` ⇒ **Stop** (a clean exit is the staff
  double-Esc; auto-relaunching it would trap staff with no way out); any other
  code ⇒ **relaunch** after a short backoff; ≥5 fast crashes in a row ⇒
  **cool off** 5 min instead of pinning the CPU. A run ≥60 s counts as healthy
  and resets the fast-crash counter.
- **PowerShell, not TypeScript or a Tauri plugin.** PowerShell 5.1 is guaranteed
  on the kiosk with zero extra runtime (Node and Pester are dev-only). The pure
  logic is unit-tested with **Pester** (`npm run test:watchdog`, 16 tests); the
  vitest suite (`npm test`) stays 308 and orientation-agnostic.

**Rejected.**
- *Registry `Run` key* — cannot elevate, cannot restart on crash, and starts at
  logon only with no supervision.
- *`tauri-plugin-autostart`* — registers a launch entry but has no crash-restart,
  and an in-process watchdog dies with the process it is meant to revive.
- *Windows Service* — runs in session 0 with no desktop, so a WebView2 GUI never
  appears. The same reason the task triggers on **logon**, not startup.

**Consequences.**
- **Opt-in, off by default.** The app build restarts nothing; auto-start is only
  the scheduled task, installed on demand (`enable-autostart.cmd` /
  `disable-autostart.cmd` are the click wrappers, or the `install-`/
  `uninstall-autostart.ps1` scripts directly). **It must stay off wherever a
  separate launcher owns the app lifecycle** — a watchdog that reopens the app on
  close fights a launcher that closes it to switch apps.
- The kiosk must be set to **auto-login** a dedicated account (a hardware step,
  P6.10); the task fires on that logon. Documented in the README.
- **Not covered:** a WebView2 renderer that crashes while the host process stays
  alive (blank board), and a hang. Both need a health signal from the running app
  and the real kiosk to validate — tracked with P6.7–P6.10. Process-death restart
  is what is buildable and testable now.
- **Two products (ADR-020) ⇒ two tasks**, two install dirs, two task names.
  `KioskPolicy.ps1` derives all three from the orientation, matched to the tauri
  configs and asserted in the Pester tests.
- The clean-exit code (`0`) is coupled to Tauri's clean-close behaviour. If a
  future Tauri version changes it, `CleanExitCode` in `KioskPolicy.ps1` is the one
  line to update — called out in a comment there.
- Verified here without touching the scheduler: the watchdog loop was driven with
  stub exes (exit 7 ⇒ relaunch with backoff then bounded stop; exit 0 ⇒ stop), the
  installer/uninstaller were run with `-DryRun`, and the policy has 16 Pester
  tests. Registering the real task needs an elevated shell on the kiosk.

---

## ADR-023 — A blob URL is revoked by whoever created it, never by a screen that only reads it

**Date:** 2026-07-30 · **Status:** Accepted

**Context.** After cropping an image the board rendered **completely black** — eight tiles, correct
sizes, correct `background-position`, and no pixels. Found by taking a screenshot of the board rather
than by asserting on the DOM; every structural check passed the whole time (the same failure mode as
ADR-018).

The cause was ownership. `App` created the cropped blob URL and kept it in state as
`preparedArtwork`; `adoptPreparedArtwork` then declared that "ownership transfers" to the Puzzle
screen, whose `useEffect(() => () => artwork?.release(), [artwork])` revoked it. That cleanup runs on
every change of `artwork` **and on unmount**, so:

* under React 18 `StrictMode` the mount → cleanup → mount cycle revoked the URL before the first
  paint, which is what produced the black board in development; and
* a remount with the same `preparedArtwork` still in `App`'s state would adopt an already-revoked
  URL in production too.

**Decision.** The creator revokes. `App` gained `replacePreparedArtwork`, the mirror of
`replaceCropSource`: it revokes the previous URL when it is replaced, clears both owned URLs on
unmount, and is the only writer of that state. `adoptPreparedArtwork().release()` is now a documented
no-op — the Puzzle screen still owns and releases the blobs *it* creates (`loadRandomArtwork`,
`loadFallbackArtwork`).

**Consequences.**
- Verified after the fix: the board slices a live 1011×1011 blob at `background-size: 1508.64px`
  (= cellSize 502.88 × 3) and the artwork is visible in a screenshot.
- "Ownership transfers" across a component boundary is not worth the two lines it saves. Two owners
  for one resource is what caused this; one owner per resource is the rule now.
- Phase 4's verification measured the board's `background-size` and concluded the export worked. It
  did not look at a pixel. **Any "the image is there" claim needs a screenshot or a pixel sample.**

---

## ADR-022 — Three parity defects, all from reading the wrong source of truth

**Date:** 2026-07-30 · **Status:** Accepted (corrects the port)

**Context.** Measuring the landscape screens turned up three values that were wrong in **portrait
too**. Each came from a plausible-looking source that is not what Unity ships.

| Thing | Port had | Unity ships | Where the truth lives |
|---|---|---|---|
| Crop handles | 80 px, white @ 0.9, `minSizeFraction` 0.2 | **50 px, opaque white, 0.5** | the SCENE's serialized `CropGridResizer` (identical in both scenes) |
| Card grid | `gap: 24`, no padding, card taller than its cell | **spacing 16, padding (16,16,16,40), SQUARE cell** | `CollectionUIManager.SetupGridLayout` / `UpdateGridCellSize` — added at runtime, so it is in neither scene |
| Label casing | every `SpriteButton` label uppercased by CSS | **only labels whose TMP `m_fontStyle` has bit 16** | `m_fontStyle` per `TMP_Text` |

The handle values are ADR-015 again — the fifth time the scene overrode a C# initialiser. The grid
values are the inverse case: `CardGrid` has **no** `GridLayoutGroup` in either scene, so the code is
the source of truth and the scene has nothing to say. The casing was a blanket CSS rule that read
plausibly and was never checked per label.

**Decision.**
- `CROP_SHARED` in `layout/crop.ts` holds the crop-grid tunables once, for both orientations, with the
  divergence from the C# defaults documented.
- `CARD_GRID` in `layout/browse.ts` holds the grid maths once, for both orientations, quoting the two
  methods it comes from. The card is now square (`aspect-ratio: 1/1`) with the caption inside it, so a
  card equals its Unity cell; the image box takes what the caption leaves.
- `TextSpec.uppercase` mirrors `m_fontStyle & 16`, `textStyle` emits `text-transform` explicitly in
  both directions, and the blanket rule is gone from `SpriteButton.module.css`. Set on: the caption,
  START, and the three footer labels, in both orientations, plus landscape's crop START. **Not** set
  on "Play Again?" or "You Win!", which Unity renders mixed case and the port was shouting.

**Consequences.**
- Behavioural change: the crop grid can now only shrink to half its initial size, not a fifth, and the
  handles are visibly smaller. Both match the shipping build.
- Verified live: handles 50 px `rgb(255,255,255)`; grid 7 columns at 960×540 landscape and 4 at
  540×960 portrait with `gap: 16px`, `padding: 16px 16px 40px`; cards 362.4² (landscape) and 381.2²
  (portrait) — square, caption 132 px inside; "Play Again?" renders mixed case.
- `text-transform` is now data. A new label that needs uppercasing must say so, which is the same
  discipline the TMP margins already follow.
- **Neither the scene nor the C# initialisers are automatically right.** Ask which one the running
  build reads: serialized field → scene; runtime-constructed component → code.

---

## ADR-021 — Landscape geometry for the remaining four screens, selected per screen from data

**Date:** 2026-07-30 · **Status:** Accepted

**Context.** ADR-019 settled the pattern for the Puzzle screen: data-drive what differs by number,
branch only where the layout MECHANISM differs. The other four screens (ImageSelect, Crop, Browse,
Win) still had portrait-only tables, and their components imported `*_PORTRAIT` directly.

Two things in the landscape scenes did not fit "same shape, different numbers":

1. **The instruction line changes parent.** Portrait hangs it inside the panel (ImageSelect) or inside
   the crop stage (Crop); landscape makes it a child of `Container`, i.e. the screen. Same element,
   different coordinate space.
2. **Landscape Browse uses an edge-stretched rect idiom the converter did not have.**
   `ClearSearchBtn`, `SearchButton`, `PrevButton` and `NextButton` are anchored to one vertical edge
   with the Y stretched and a `sizeDelta` on the stretched axis — the mirror of `HorizontalBandRect`,
   which the portrait table had side-stepped by pre-resolving those rects to point rects.

**Decision.**
- Four new tables: `layout/crop-landscape.ts` (ImageSelect + Crop), `layout/browse-landscape.ts`,
  `layout/win-landscape.ts`, each transcribed verbatim with a divergence table in its header.
- `layout/screens.ts` selects per screen by `ORIENTATION`, with an explicit interface per screen — the
  same idea as `chrome.ts`, so a missing field in a new table is a compile error.
- `descriptionParent: 'screen' | 'panel' | 'stage'` is part of the table; the components render the
  description where the table says instead of assuming.
- `rectStyle` gained a fourth idiom, `verticalBand`, deriving
  `height = (b − a)·parentH + sizeDelta.y` and
  `cssTop = (1 − b)·parentH − pos.y − (1 − pivot.y)·sizeDelta.y`.

**Consequences.**
- Landscape is again not portrait rearranged: the panel, both choice rects, every caption size, the
  crop stage, the grid's initial size, the rotate buttons, the crop START, all five dropdown widths,
  the page arrows and the whole win popup differ. The headers record each one.
- Verified at 960×540 (all four screens driven through a stubbed IPC) and re-checked at 540×960 for
  portrait regression. Figures in [roadmap.md](roadmap.md) Phase 6.
- The portrait table still pre-resolves its own vertical bands to point rects (`PrevButton` 100 ×
  581.4 = 2582.4 − 2001). Left as it is — the numbers are equivalent and it is verified — but the two
  tables now express the same scene idiom differently, which is noted in both headers.
- `PerPageDD` and `GridViewButton` stay unported in landscape too, for the reasons already recorded
  (P3.11: no option list anywhere; there is only one view).
- The landscape scene's win `PatternDesign` carries `sizeDelta (2340, 960)`. Recorded and deliberately
  not rendered: it is a flat colour clipped by `DesignMask`, so stretching it to the mask is
  pixel-identical.

---

## ADR-020 — Portrait and landscape ship as two separate installers

**Date:** 2026-07-30 · **Status:** Accepted (client directive)

**Context.** Orientation is a build-time flag (`VITE_ORIENTATION`), because the geometry tables and
the footer mechanism are selected at module scope. With a single `productName` and `identifier`, a
landscape build would install *over* the portrait one — same install directory, same app data, same
Start-menu entry.

Two options were put to the client:

1. **Two products** — separate `productName`/`identifier`, two installers that coexist.
2. **One product, orientation as a runtime setting** — read from a config file beside the exe, so one
   artefact serves both kiosks.

I recommended (2): one artefact to sign, one to deploy, and the operator flips a file.

**Decision.** The client chose **two installers**.

**Implementation.** `src-tauri/tauri.landscape.conf.json` is a config OVERLAY, passed with
`tauri build --config`. It changes only `productName`, `identifier` and the development window; the
base config keeps everything else, so there is one place to edit CSP, bundle settings and icons.
`build.bat` takes an orientation word (`portrait` — the default — or `landscape`) in either argument
position, sets `VITE_ORIENTATION` for the front end and adds the overlay for the shell.

**Consequences.**
- The two installers coexist. Different `identifier` also means separate WebView2 data and separate
  `localStorage`, so **high scores do not carry across orientations** — correct, since the key is
  per-artwork and the two kiosks are different machines anyway.
- Both products share the version from `package.json`. A release is "v0.1.3 portrait" and
  "v0.1.3 landscape", not independently numbered.
- **Two artefacts to code-sign** rather than one, which doubles that step (B5).
- Both installers land in the same `bundle/nsis/` folder, so `build.bat` matches its own orientation's
  installer by name rather than globbing whichever sorted last.
- The Cargo binary keeps one name (`map-jigsaw-puzzle.exe`), so a landscape build overwrites the
  portable exe from a previous portrait build in `target/release/`. Only the *installers* are durable
  side by side; if both portable exes are ever needed at once, copy them out between builds.

---

## ADR-019 — One component tree per screen, except where the LAYOUT MECHANISM differs

**Date:** 2026-07-30 · **Status:** Accepted

**Context.** [architecture.md §2.6](architecture.md) asks for one component tree with geometry driven
from per-orientation data tables. That holds for most of the Puzzle screen — background, logo, back
button, preview inset and artwork title differ only in their numbers, so `layout/chrome.ts` selects
them by orientation and the component never branches.

It does **not** hold for the footer. Portrait positions its five controls absolutely from fractional
anchors. Landscape's `ControlButtons_00` carries a `HorizontalLayoutGroup` (spacing 50, childAlignment
7 = LowerCenter, `childForceExpandWidth/Height = 1`, `childControlWidth/Height = 0`) plus a
`ContentSizeFitter`, and every child sits at `pos (0,0)` because the layout group places them at
runtime. That is a difference in mechanism, not in values.

**Decision.** Data-drive what is data. Branch what is mechanism: `LandscapeFooter` is a separate
component rendering a flex row, chosen by `ORIENTATION` at module scope.

**Consequences.**
- Reading `docs/ui/scene-landscape.md` alone would have stacked all five controls on top of each
  other at `pos (0,0)` — `extract_ui.py` does not report layout groups. **Fourth** time the scene
  YAML had to be consulted directly (ADR-015, ADR-016, ADR-017).
- Landscape is not portrait rearranged: the back button is 72² rather than 124², the logo is
  top-right, and every font size differs (START 82 vs 112, footer labels 44 vs 68, timer 82 vs 100,
  high-score value 52 vs 82). The high-score badge is a flat `#67787F` fill rather than the masked
  9-sliced sprite. Assuming a shared component with different numbers would have been wrong twice
  over.
- `justify-content: space-evenly` approximates `childForceExpandWidth`. Measured, it puts 66.8 px
  between controls where Unity's slot-expansion maths predicts 70 px, and 16.4 px at the ends versus
  10 px. **Within a few reference px but not exact — settle it against a Unity capture.**
- `SpriteButton.rect` is now optional so a button can be laid out by a flex parent.

---

## ADR-018 — The win screen is an overlay on the Puzzle screen, not a routed screen

**Date:** 2026-07-29 · **Status:** Accepted

**Context.** `WinScreen` is one of the eight screen roots in the scene, so the obvious port is a
fifth entry in the router's `ScreenId`. But its own `Background` image is
`Background_Portrait.png` at **alpha 0** — fully transparent. The solved board and the full-image
preview must remain visible behind it; cross-fading to black would hide exactly the thing the
visitor just finished.

**Decision.** Render `WinScreen` as an overlay inside the Puzzle screen, driven by the reducer's
`phase === 'won'`. `ScreenId` covers only the four screens the router actually cross-fades between.

**Consequences.**
- The reveal → 1 s delay → win sequence stays entirely in the reducer, already tested.
- **It needs an explicit `z-index` (20).** In Unity `WinScreen` is a later *sibling* than the whole
  Puzzle screen, so it naturally paints above the preview panel. Nested inside the Puzzle screen it
  does not: the preview panel's `z-index: 10` covered the popup completely and the win screen was
  invisible while still present in the DOM. Caught by screenshot, not by a passing DOM assertion —
  `innerText` contained "You Win!" the whole time.
- `resolveBack` has no `win` case, because the win screen has no Back button.

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

---

## ADR-026 — Arrow Layer Ordering Behind Tiles

**Date:** 2026-07-30 · **Status:** Accepted

**Context.** Arrow indicators (the directional pulse indicators straddling the empty slot and adjacent tiles) previously rendered on top of puzzle tiles (`z-index` higher than tiles, DOM order after tiles). This caused the circular body of the arrow to overlap and obscure the puzzle tile graphic.

**Decision.** Render arrows **behind** the puzzle tiles in DOM order (and set `.arrow` `z-index: 1`, `.tile` `z-index: 2`).

**Consequences.**
- Puzzle tiles render on top of the arrow graphics, cleanly covering the portion of the arrow circle that lies inside the tile boundaries.
- The arrow indicator remains visible in the empty cell slot.
- Tapping on the visible arrow portion in the empty slot correctly triggers tile movement without visually cluttering adjacent tiles.

---

## ADR-027 — Browse Card Image-Only Display and Filter By Alignment

**Date:** 2026-07-30 · **Status:** Accepted

**Context.** 
1. The artwork card in the Browse screen previously rendered a text caption block (title, artist, accession number) below the image. As shown in the reference UI (`temp/3.Listing.png`), cards must display only the square artwork image thumbnail.
2. The "Filter By" title had an vertical offset discrepancy (`top: -92px` vs `Clear Filters` `top: -88.77px`) causing baseline misalignment across the filter bar.

**Decision.**
1. Removed the caption text block from `ArtworkCard.tsx`, making the card purely a square artwork image container (`object-fit: cover;` filling the 1:1 cell without black letterboxing/padding).
2. Adjusted `titleRect` in `browse.ts` and `browse-landscape.ts` and updated `.filterTitle` / `.clearFilters` flex alignment so both headers share an identical vertical baseline.

**Consequences.**
- Cards display only the square artwork image filling the card cell cleanly with no black padding, matching `temp/3.Listing.png`.
- "Filter By" and "Clear Filters" align on the same horizontal row above the filter dropdowns in both portrait and landscape builds.

---

## ADR-028 — Image Loading Performance Optimizations

**Date:** 2026-07-30 · **Status:** Accepted

**Context.**
1. **Browse Screen Grid (Listing Page):** `ArtworkCard` was passing 40 ImageKit thumbnail requests through Rust `image_fetch` and serializing 40 binary array buffers over the Tauri IPC bridge (`invoke`), creating severe connection and IPC serialization bottlenecks.
2. **Puzzle Screen Boot (Home Page):** On initial launch, `loadRandomArtwork` executed a blocking API query (~8s) and downloaded a 4MB–7MB uncompressed master artwork before showing the puzzle board, making the app hang on boot for 12–15 seconds.

**Decision.**
1. **Browse Screen:** Render `thumbnailUrl` directly in `<img src={thumb} loading="lazy" decoding="async" />`. WebView2 / Chromium handles parallel HTTP/2 downloads, image decoding, and disk caching natively without IPC bridge serialization overhead.
2. **Home Page Boot:** Initial launch and attract mode use `loadFallbackArtwork` to render local pre-bundled artwork instantly (0 ms). When visitors browse and select an artwork from the MAP collection, `loadArtworkFromCollection` fetches and crops that specific piece.

**Consequences.**
- Grid card thumbnails on the Browse screen load smoothly and in parallel.
- Home page boot and attract mode render instantly with zero network delay.

---

## ADR-029 — Browse Screen UI Feedback, Hidden Scrollbar & Loading Overlay

**Date:** 2026-07-30 · **Status:** Accepted

**Context.**
1. **Scrollbar:** The card grid container (`.cardScroll`) had a visible scrollbar.
2. **Page Navigation Feedback:** Tapping Next/Prev/Filter triggered a background API query (~8s) without visual feedback on the card area, leaving the user with zero indication that a page load was in progress.
3. **Local AppData Cache Location:** Needed explicit documentation for where Tauri stores cached images.

**Decision.**
1. Hidden native scrollbars on `.cardScroll` (`scrollbar-width: none` and `::-webkit-scrollbar { display: none; }`).
2. Added immediate 12-card skeleton shimmer placeholders for initial load, a semi-transparent `loadingOverlay` for page changes, disallowing double-clicks on page arrows during fetch (`canNext`, `canPrev` disabled while loading).
3. Documented local AppData cache path: `%LOCALAPPDATA%\MAP Jigsaw Puzzle\image-cache\`.

**Consequences.**
- The listing card grid scrollbar is hidden.
- Page navigation gives instant visual feedback with shimmer cards / loading overlays and status text updates.

---

## ADR-030 — Collection API JSON Disk Caching and Unity PageNumbers Bar

**Date:** 2026-07-30 · **Status:** Accepted

**Context.**
1. **Local Cache Location:** The Windows Local AppData cache path is `%LOCALAPPDATA%\cloud.viitor.map.jigsaw-puzzle\cache\` (based on `tauri.conf.json` app identifier `cloud.viitor.map.jigsaw-puzzle`).
2. **API Latency (10s+ delay):** Remote API queries (`srcapi.cumulus.co.in`) took ~8–12s on every single page request.
3. **Pagination UI Discrepancy:** `BrowseScreen` rendered text only without interactive numeric page buttons (`[1] [2] [3]...`), differing from Unity's `PageNumbers` bar (`temp/3.Listing.png`).

**Decision.**
1. **API Disk Caching:** Implemented 24-hour JSON disk caching in Rust `collection_fetch` (`%LOCALAPPDATA%\cloud.viitor.map.jigsaw-puzzle\cache\collection_cache\`). Repeated queries / page returns resolve in **1 ms** (`[collection_fetch CACHE HIT] loaded in 1ms`).
2. **Pagination Buttons:** Added page number pill buttons (`[1] [2] [3] [4] [5] ... [808]`) with pink active page highlighting, matching Unity `temp/3.Listing.png`.
3. **Timing Diagnostics:** Added high-precision timing logs in Rust and JS (`[browse] collection page N loaded in Xms`).

**Consequences.**
- Subsequent page visits and re-openings load from disk cache in 1 ms.
- Pagination bar UI matches Unity screenshot (`temp/3.Listing.png`) with interactive numeric page pills.

---

## ADR-031 — Card Container Full Coverage Loading Overlay

**Date:** 2026-07-30 · **Status:** Accepted

**Context.**
`loadingOverlay` was previously rendered inside `.cardScroll`, which caused it to only cover the scroll view's inner area rather than the entire black card panel container (`.cardContainer`), leaving top/bottom card rows and side arrow margins exposed during page loading.

**Decision.**
Moved `loadingOverlay` to be a direct child of `.cardContainer` with `position: absolute; inset: 0; z-index: 50;`.

**Consequences.**
- The loading backdrop overlay covers 100% of the entire card container section (including card grid and side arrow margins), centering the spinner and loading text perfectly over the whole card panel.

---

## ADR-032 — Common Loading Sprite Sheet Integration (`/assets/common/loading.png`)

**Date:** 2026-07-30 · **Status:** Accepted

**Context.**
`/assets/common/loading.png` is a 3840×3840 px **6×6 grid sprite sheet** containing 27 animated loading frames (640×640 px per frame). Rendering it at a small initial size made the visible inner icon tiny.

**Decision.**
1. Implemented a 27-step CSS sprite sheet animation (`@keyframes loading-spritesheet`) in `BrowseScreen.module.css` using `background-image: url('/assets/common/loading.png')` and `background-size: 600% 600%`.
2. Increased `.loadingSpinner` dimensions by 500% (to `400px × 400px`) and `.cardSpinner` to `180px × 180px` to make the animated loading graphic prominent and clearly visible.

**Consequences.**
- The application plays the 27-frame animated loading sprite sequence at 500% larger size, clearly visible across page loading overlays and card placeholders.

---

## ADR-033 — Browse Screen Loading Blur Effect

**Date:** 2026-07-30 · **Status:** Accepted

**Context.**
Needed a modern blur visual effect over the grid area while page/filter loading is in progress.

**Decision.**
1. Added `.blurLoading` (`filter: blur(10px); opacity: 0.4; pointer-events: none; transition: filter 250ms ease-out, opacity 250ms ease-out;`) to `BrowseScreen.module.css`.
2. Applied `${isLoading ? styles.blurLoading : ''}` to `.cardScroll` in `BrowseScreen.tsx`, and increased `backdrop-filter: blur(12px)` on `loadingOverlay`.

**Consequences.**
- While loading, the artwork grid smoothly blurs out (`filter: blur(10px)`) under the dark loading overlay, and smoothly un-blurs back to crisp focus once data arrives.

---

## ADR-034 — Image Select Orientation-Specific Divider Line

**Date:** 2026-07-30 · **Status:** Accepted

**Context.**
On `ImageSelectScreen`, choices are stacked vertically in Portrait mode and side-by-side in Landscape mode. Previously, a vertical line was rendering in Portrait mode between top and bottom boxes.

**Decision.**
1. Updated `IMAGE_SELECT_PORTRAIT.dividerRect` in `src/layout/crop.ts` to `size: { x: 682, y: 2 }` and `pos.y: -38` for a crisp **horizontal divider line (`—`)** between stacked top/bottom choices.
2. Preserved `IMAGE_SELECT_LANDSCAPE.dividerRect` in `src/layout/crop-landscape.ts` as a **vertical divider line (`|`)** between side-by-side left/right choices.
3. Updated `.divider` styling in `ImageSelectScreen.module.css` with `object-fit: fill` and subtle white background opacity.

**Consequences.**
- Portrait mode displays a clean horizontal divider separating top and bottom panels.
- Landscape mode displays a clean vertical divider separating left and right panels.

---

## ADR-035 — Gameplay SVG Vector Asset Migration

**Date:** 2026-07-30 · **Status:** Accepted

**Context.**
Added 21 vector SVG files (`back-button.svg`, `home-button.svg`, `start-button.svg`, `reset-button.svg`, `preview-button.svg`, `new-image-button.svg`, `play-again-button.svg`, `timer-background.svg`, `arrow-up.svg`, `arrow-down.svg`, `arrow-left.svg`, `arrow-right.svg`, etc.) to `public/assets/gameplay/` for resolution-independent 4K rendering.

**Decision.**
Updated layout configurations (`portrait.ts`, `landscape.ts`, `crop.ts`, `crop-landscape.ts`, `win.ts`, `win-landscape.ts`, `browse.ts`, `browse-landscape.ts`) and game moves logic (`moves.ts`, `Board.tsx`) to load vector `.svg` assets. `map-logo.png` retained as PNG pending logo path verification.

**Consequences.**
- UI buttons, icons, directional controls, and timer backgrounds render crisp vector lines at 4K resolution.
- 308 Vitest unit tests pass and release build verified.

---

## ADR-036 — Visible Mouse Cursor in Production Release Builds

**Date:** 2026-07-30 · **Status:** Accepted

**Context.**
Production builds previously set `data-cursor="hidden"` on `document.documentElement` in `src/main.tsx`, enforcing `cursor: none` across the app in packaged builds.

**Decision.**
Updated `src/main.tsx` to keep the mouse pointer visible in production release builds by default (gated under `import.meta.env.VITE_HIDE_CURSOR === '1'` if hidden cursor is explicitly needed).

**Consequences.**
- The mouse pointer is visible during mouse interactions and testing in release builds.
- 308 Vitest unit tests pass and release build v0.1.7 verified.

---

## ADR-037 — Compile-Time Fallback API Configuration Embedding

**Date:** 2026-07-30 · **Status:** Accepted

**Context.**
When installing the packaged release executable on a new machine without a `.env` file present beside the executable, `std::env::var()` calls returned empty strings, logging `base_url MISSING, key MISSING, client_id MISSING, client_secret MISSING` and falling back to bundled offline artwork.

**Decision.**
1. Updated `src-tauri/build.rs` to read `src-tauri/.env` at build time and emit `cargo:rustc-env` variables for all `MAP_*` configuration keys.
2. Updated `src-tauri/src/config.rs` to use `option_env!(...)` compile-time fallbacks when runtime environment variables and local `.env` files are absent.

**Consequences.**
- Packaged release binaries run out-of-the-box on any new machine/kiosk with pre-configured API access.
- Local `.env` files and system environment variables continue to override the compile-time defaults if specified.
- 308 Vitest unit tests pass and release build v0.1.8 verified.

---

## ADR-038 — Clean Vector Up/Down Arrows & MAP Logo Header Asset Fix

**Date:** 2026-07-30 · **Status:** Accepted

**Context.**
1. `arrow-up.svg` and `arrow-down.svg` contained an unneeded solid black background path (`fill="#000000"`), which blended into the dark puzzle board background and rendered up/down directional arrows invisible.
2. `map-logo.svg` was a placeholder solid white rectangle, causing the MAP Museum logo header at the top center of every screen to render invisibly or fail to display.

**Decision.**
1. Replaced `arrow-up.svg` and `arrow-down.svg` with clean vector rotations (`rotate(90deg)` and `rotate(-90deg)`) of the green-and-white arrow icon.
2. Replaced `map-logo.svg` with a high-DPI vector SVG emblem featuring the MAP Museum of Art & Photography logo typography (`M A P`) and accent emblem, and updated layout tables (`portrait.ts`, `landscape.ts`, `browse.ts`, `browse-landscape.ts`, `crop.ts`, `crop-landscape.ts`) to use `map-logo.svg`.

**Consequences.**
- Up and Down directional tile arrows are fully visible and pulse cleanly during gameplay.
- The MAP Museum logo header renders crisp and centered across all screens.
- 308 Vitest unit tests pass and release build v0.1.9 verified.

---

## ADR-039 — Full SVG Asset Integration Across Browse, Crop, and Select Screens

**Date:** 2026-07-30 · **Status:** Accepted

**Context.**
Added 7 additional SVG vector files (`grid-view.svg`, `page-selection-box.svg`, `pagination-arrow.svg`, `search-button.svg`, `crop-reference-frame.svg`, `export-arrow.svg`, `gallery-add.svg`) across `public/assets/browse/`, `public/assets/crop/`, and `public/assets/select/`.

**Decision.**
Updated layout configurations (`browse.ts`, `browse-landscape.ts`, `crop.ts`, `crop-landscape.ts`) to use `.svg` vector asset paths for search icons, grid view buttons, pagination arrows, crop reference frames, and gallery add buttons.

**Consequences.**
- UI icons across all screens now render crisp vector graphics at 4K resolution.
- 308 Vitest unit tests pass and release build v0.1.10 verified.

---

## ADR-040 — New Image Navigation to QR Screen & Crop Screen Start Button Y-Alignment

**Date:** 2026-07-30 · **Status:** Accepted

**Context.**
1. Pressing the "New Image" button on the home/puzzle screen previously triggered a local artwork re-shuffle rather than navigating to the QR upload screen (`ImageSelectScreen`).
2. The `START` button on `CropScreen` was vertically misaligned relative to the `New Image` button baseline on the home screen.

**Decision.**
1. Updated `PuzzleScreen.tsx` and `App.tsx` so clicking "New Image" routes directly to `ImageSelectScreen` (`go('select')`).
2. Updated `startButton.rect` Y-anchors in `crop.ts` (`anchorMin.y: 0.2476`, `anchorMax.y: 0.294`) and `crop-landscape.ts` (`pos.y: 77`) to align the `START` button on the `CropScreen` with the `New Image` button Y-baseline on the home screen.

**Consequences.**
- Clicking "New Image" opens the QR scan / selection screen as expected.
- The `START` button on the `CropScreen` aligns with the `New Image` button vertical position across screens.
- 308 Vitest unit tests pass and release build v0.1.11 verified.

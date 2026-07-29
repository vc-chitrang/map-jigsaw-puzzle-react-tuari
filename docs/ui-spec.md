# UI Specification — screens, element geometry, animation sequences

Companion to [pixel-perfect-replication.md](pixel-perfect-replication.md) (the coordinate maths)
and the **generated, exhaustive** element dumps:

- [ui/scene-portrait.md](ui/scene-portrait.md) — every element, 2160×3840
- [ui/scene-landscape.md](ui/scene-landscape.md) — every element, 3840×2160

Those two files are the authoritative numbers (regenerate with `extract_ui.py`). This document
explains the **structure, idioms and animation** so the numbers are usable.

---

## 1. Canvas & scaling model

| Scene | Reference resolution | UI Scale Mode | Screen Match Mode |
|---|---|---|---|
| Portrait | **2160 × 3840** | ScaleWithScreenSize (`1`) | MatchWidthOrHeight, match `0.5` |
| Landscape | **3840 × 2160** | ScaleWithScreenSize (`1`) | MatchWidthOrHeight, match `0.5` |

A second canvas in each scene uses **Expand** (`matchMode = 2`, match `0`) — used for overlays that
must never crop.

**All numbers in these docs are reference-resolution pixels.** At runtime Unity multiplies
everything by a single uniform `scaleFactor`. See the replication doc for the exact formula.

---

## 2. The two layout idioms (read this before porting any screen)

Unity `RectTransform` values appear in exactly two shapes in these scenes. Recognising which one
you're looking at makes the CSS translation mechanical.

### Idiom A — fractional (percentage) anchors

`anchorMin ≠ anchorMax`, `size = (0, 0)`, `pos = (0, 0)`.
The element's edges are defined **as fractions of its parent**. This is percentage layout.

```
StartPuzzleButton: anchorMin=(0.233, 0.3202)  anchorMax=(0.4766, 0.3707)
```

→ CSS (note the **Y flip**: Unity Y=0 is bottom, CSS top=0 is top):

```css
.start-button {
  position: absolute;
  left:   23.30%;                      /* anchorMin.x */
  width:  24.36%;                      /* anchorMax.x − anchorMin.x */
  bottom: 32.02%;                      /* anchorMin.y   (or use top: 1 − anchorMax.y) */
  height:  5.05%;                      /* anchorMax.y − anchorMin.y */
}
```

Most of the Puzzle screen uses this idiom — it is **resolution-independent by construction**, so
it survives any window size. Prefer keeping it as percentages rather than converting to px.

### Idiom B — fixed size at a single anchor point

`anchorMin == anchorMax` (a point), `size = (W, H)`, `pos = (offsetX, offsetY)` from that point,
with `pivot` deciding which part of the element sits on the anchor.

```
BackButton: anchorMin = anchorMax = (0, 0.5)   pos=(40, 60)   size=(124, 124)   pivot=(0, 0.5)
```

→ anchored to the parent's **left edge, vertical centre**; pivot is its own left-centre:

```css
.back-button {
  position: absolute;
  left: 40px;                          /* pos.x, pivot.x = 0 → no offset correction */
  top: 50%;
  transform: translateY(calc(-50% - 60px));   /* pivot.y = 0.5; Unity +Y is up → CSS negative */
  width: 124px; height: 124px;
}
```

**Pivot correction rule:** the element's own `pivot` fraction sits on the anchor point, so shift by
`−pivot.x × width` and `+ (1 − pivot.y) × height` when converting to CSS `left/top`.

`size` with a **negative** component means "stretch minus margin" (e.g. `PreviewImage`
`size=(0, −1680)` = full width, 1680 px shorter than the parent).

---

## 3. Screen inventory

Both scenes contain the same 8 screen roots as siblings under the canvas; exactly one gameplay
screen is active at a time. Prefix markers: `[E]`/`[D]` = enabled/disabled at start,
`[E/D]` = toggled at runtime, `[X]` = deprecated.

| # | Screen | Start state | Notes |
|---|---|---|---|
| 1 | `Puzzle_Screen` | **active** | Board + footer; attract & gameplay modes |
| 2 | `ImageSelectOrUploadScreen` | inactive | Two choices: MAP collection / QR |
| 3 | `Browse_And_Discover_Screen` | inactive | Search, 5 filters, sort, paginated grid |
| 4 | `Crop_Image_Screen` | inactive | Pan/zoom/rotate → square crop |
| 5 | `WinScreen` | inactive | High score, your score, Play Again |
| 6 | `QRScanScreen` | inactive `[X]` | **Unused** in current flow |
| 7 | `Artwork Focus Screen` | inactive `[X]` | **Unused** — Crop goes straight to puzzle |
| 8 | `ProgressPanel` | inactive | Loading/progress overlay |

Do **not** port screens 6 and 7 unless the flow changes — they are dead in the shipping build.

---

## 4. Puzzle_Screen (primary screen)

Background: `Background_Portrait.png` / landscape equivalent, full-stretch, white tint (`#FFFFFF`).

### 4.1 Structure

```
Puzzle_Screen                      full stretch, Image = Background
├── AppLogo                        anchors (0.3969,0.8821)–(0.6031,0.9494), pivot (0.5,1)
│                                  sprite "Map Logo.png", preserveAspect
├── BackButton                     anchor (0,0.5) pos (40,60) size 124×124, sprite HomeButton.png
├── ArrowLayer                     full stretch
│   └── EmptySlotOverlay           anchor centre, size 160×160
├── BoardPanel                     full stretch container; RESIZED AT RUNTIME to a square
├── PreviewPanel      [inactive]   full stretch, backdrop #000000 @ alpha 0.86
│   ├── PreviewImage               full width, size (0, −1680)
│   └── ClosePreviewButton         anchor (1,1) pos (−120,−76) size 190×60, #BF3B33 @ 0.97
├── Footer
│   ├── "Start Puzzle" caption     anchor centre, pos (0,−377)
│   │                              ConduitITC-Bold, size 83, #E7B639
│   │                              text "TAP THE TILES TO SOLVE THE PUZZLE"
│   ├── StartPuzzleButton [E/D]    anchors (0.233,0.3202)–(0.4766,0.3707)
│   │                              SpriteSwap: StartButton.png ⇄ StartButton-pressed.png
│   │                              └── Start-text  ConduitITC-Bold 112, #FFFFFF, "START"
│   ├── TimerBackground   [E/D]    anchor centre, pos (−313.65,−593.56), size 526×194
│   │   └── Timer                  ConduitITC-Bold 100, #FFFFFF, "00:00"
│   ├── HighScoreBackground        anchors (0.5669,0.3262)–(0.7175,0.3565)
│   │                              sprite Circle_9Sliced.png, tint #67797F
│   │   ├── HighScoreTitleText     anchor top, pos (0,4.4) size (0,40)
│   │   │                          ConduitITC-Bold 48, #FFFFFF, "HIGH SCORE"
│   │   └── HighScoreText          full stretch, ConduitITC-Bold 82, #FFFFFF, "--:--"
│   ├── ResetButton                anchors (0.1311,0.2476)–(0.3302,0.294)
│   ├── PreviewButton              anchors (0.4005,0.2476)–(0.5995,0.294)
│   └── NewImageButton             anchors (0.6708,0.2476)–(0.8699,0.294)
└── Header            [X]          unused
```

`StartPuzzleButton` and `TimerBackground` are **mutually exclusive**: START shows in attract mode,
the timer shows in gameplay (`SetStartButton` / `SetTimer` swap them).

### 4.2 Footer button anatomy (identical for all three)

```
<Button>                     Image = <Name>.png, preserveAspect
                             transition = SpriteSwap, pressedSprite = <Name>-[Pp]ressed.png
                             components: ButtonPressOffset (+ UIPressHandler on Preview only)
├── button-text              full stretch, ConduitITC-Bold size 68, #FFFFFF
└── icon                     fractional anchors, preserveAspect
```

| Button | Label | Icon sprite | Icon anchors (portrait) |
|---|---|---|---|
| ResetButton | `RESET` | `rotate-right.png` | (0.2272,0.336)–(0.3784,0.7011) |
| PreviewButton | `preview` | `Group.png` | (0.146,0.3367)–(0.3088,0.73), pivot (0,0.5) |
| NewImageButton | `new image` | `new image icon.png` | (0.0958,0.336)–(0.2586,0.7292) |

Labels are authored lowercase (`preview`, `new image`) and rendered uppercase by the font/styling —
in CSS use `text-transform: uppercase` and keep the source strings as-is.

### 4.3 Runtime-created elements (not in the scene file)

These are built by `GameManager` at runtime — the port must create them too:

| Element | Parent | Geometry / style |
|---|---|---|
| `BoardPanel_Container` | BoardPanel's parent | mirrors BoardPanel's rect exactly; rendered **last** (on top) |
| `ArtworkName` | BoardPanel_Container | anchors (0,1)–(1,1), pivot (0.5,0), size (0,100), pos (0,10) → floats 10 px above board top; TMP size **62**, colour **`#DCB63C`** (code value; the doc comment says `#FFA300` — see note), Left/Middle, wrap on, truncate, `raycastTarget = false` |
| `Outline` | BoardPanel (**first** child, behind tiles) | full stretch with **−2 px** margin all sides, white, non-raycast |
| `Tile_00..07` | BoardPanel | `cellSize × cellSize`, Image + Button |
| `EmptySlot` | BoardPanel | empty RectTransform placeholder; gains an Image on win |
| `Arrow_x_y` ×4 | BoardPanel (**last** children, on top) | `cellSize × 0.38`, anchored (0,1), `ignoreLayout` |

> **Discrepancy to resolve during the port:** `GameManager.EnsureArtworkTitleObject()` sets the
> artwork-title colour to `new Color(0.8627, 0.7137, 0.2353)` ≈ **`#DCB63C`**, while its own
> doc comment and the brand palette specify **`#FFA300`** (MAP Aamras). Pick one deliberately —
> brand guide says `#FFA300`.

---

## 5. Browse_And_Discover_Screen

Search + filtering UI over a paginated card grid. Key behaviours (geometry in the generated dump):

| Element | Behaviour |
|---|---|
| `SearchInputField` | TMP input; opens the on-screen keyboard on focus; submits on Enter (`onSubmit`) |
| Clear-search button | Visible only when the field has text (`UpdateSearchControls`) |
| 5 filter dropdowns | Department, Classification, Artist/Maker, Place of origin (culture), Date — each gets a **searchable** popup (`DropdownSearchController`) with its own input + clear button |
| Sort dropdown | 5 modes → `["", artist, artist, date, date]` asc/desc |
| Result count | `"{from} to {to} of total {total} results"` from pagination |
| Pagination | Prev/next enabled by `_currentPage > 1` / `< _lastPage`; page-number buttons |
| Card grid | `GridLayoutGroup`; **cell size computed at runtime** (below) |
| Card | image + `CardTitleText`, `CardArtistText`, `CardAccessionText`; tap → Crop screen |

**Responsive grid maths** (`UpdateGridCellSize`, runs when the content width changes):

```
targetCellSize = 320
availableWidth = contentWidth − padding.left − padding.right
columns  = max(2, floor((availableWidth + spacing.x) / (targetCellSize + spacing.x)))
cellSize = max(10, (availableWidth − spacing.x × (columns − 1)) / columns)
cell is square: (cellSize, cellSize)
```

CSS equivalent — one line, same result:

```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--grid-gap);
}
.card { aspect-ratio: 1 / 1; }
```

**Keyboard dismissal rule** (`HandleKeyboardDismiss`): on pointer **up**, if the tap moved
< 15 px (a tap, not a drag) and did **not** land on a `TMP_InputField` (checked via both
EventSystem selection and a raycast), the on-screen keyboard closes and the field deselects.

---

## 6. Crop_Image_Screen

> ⚠️ **CORRECTED 2026-07-29 — see [ADR-017](decisions.md).** The pan/pinch-zoom and zoom-slider rows
> below describe components that are **not active in the scene**. `ZoomSlider` and `ResetZoomButton`
> live under `[X]DisableButtons` (inactive), and there is no `PinchableScrollRect`.

| Element | Behaviour |
|---|---|
| `ImageToCrop` | Displayed **fitted** (`preserveAspect`). Does **not** pan or zoom |
| Crop grid | **Square**, resized by 4 corner handles about the opposite corner, moved by dragging its body, clamped inside the visible image (`CropGridResizer`). Min 20 % of its initial size; handles 80 px white @ 0.9 |
| Rotate buttons | Visual tween **±90° over 0.3 s, `Ease.Linear`**, then commits the pixel rotation |
| ~~Zoom reset button~~ | ~~`interactable` only while `zoomSlider.value < 0.99`~~ — **does not ship** |
| `CropIAndStartButton` | Produces the square sprite → `StartPuzzleWithCroppedSprite(sprite, title)` |

Accepts a **new QR upload while open** — replaces the image in place without leaving the screen.

---

## 7. WinScreen

| Element | Content |
|---|---|
| `HighScoreValueText` | best time `mm:ss`, or `--:--` when unset |
| `YourScoreValueText` | this run's time `mm:ss` |
| `PlayAgainButton` | new random image → **straight into gameplay** (skips attract mode) |

Shown **1.0 s (realtime)** after the winning move, together with the full-image preview.

---

## 8. Animation sequences (complete inventory)

Every animation in the app, with exact timing. All easing names are DOTween's.

| # | Animation | Target | Duration | Easing | Loop |
|---|---|---|---|---|---|
| 1 | **Tile slide** | tile `anchoredPosition` | **0.14 s** | `OutCubic` | once |
| 2 | **Arrow idle pulse** | arrow `scale 1 → 1.06` | **0.25 s** | `Linear` | **∞ Yoyo** (ping-pong) |
| 3 | **Screen cross-fade (out)** | overlay `alpha 0 → 1` | **0.2 s** | `OutQuad` | once |
| 4 | **Screen cross-fade (in)** | overlay `alpha 1 → 0` | **0.2 s** | `InQuad` | once |
| 5 | **Crop rotate** | image `rotation ±90°` | **0.3 s** | `Linear` | once |
| 6 | **Auto-shuffle cadence** | one tile move per tick | **1.0 s** interval | — | while attract mode |
| 7 | **Win screen delay** | wait then show | **1.0 s** realtime | — | once |
| 8 | **Button press offset** | label + icon `−10, −10 px` | instant (no tween) | — | held |
| 9 | **Dropdown focus restore** | delay before refocus | **0.45 s** realtime | — | once |
| 10 | **Image download retry gap** | delay | **0.5 s** | — | per retry |

### 8.1 Sequence detail — screen transition

```
t=0.0   overlay activated, alpha 0, blocksRaycasts = true
t=0.0→0.2   alpha 0 → 1          (OutQuad)
t=0.2   outgoing screen deactivated; incoming screen activated   ← swap at full black
t=0.2→0.4   alpha 1 → 0          (InQuad)
t=0.4   blocksRaycasts = false; overlay deactivated
```

CSS/React equivalent:

```ts
// keep the swap at the midpoint, and always clear the overlay
const FADE = 200; // ms
setPhase('out');                       // opacity 0→1, cubic-bezier ≈ ease-out
await wait(FADE);
swapScreens();                         // guard with try/catch — a throwing mount must not wedge it
setPhase('in');                        // opacity 1→0, ease-in
await wait(FADE);
setPhase('idle');                      // pointer-events: none  ← never skip this
```

### 8.2 Sequence detail — winning move

```
tile tween 0.14 s (OutCubic)
  → CheckSolved() true
  → timer stops, high score written
  → status "Solved in N moves"
  → EmptySlot gains the 9th slice (picture completes, instant)
  → wait 1.0 s realtime
  → full-image preview shown + WinScreen activated
```

### 8.3 Button press feedback

Sprite Swap changes the background sprite; `ButtonPressOffset` simultaneously moves
`button-text` **and** `icon` by `(−10, −10)` px. Both are held while the pointer is down —
including when the pointer **leaves** the button — and released together on pointer-up.

```css
.btn:active { background-image: var(--sprite-pressed); }
.btn:active .btn-label,
.btn:active .btn-icon { transform: translate(-10px, 10px); } /* CSS +Y is down */
```

> Unity's `Selectable` keeps the pressed state while held even after the pointer exits, so
> the label/icon offset must do the same. CSS `:active` matches this behaviour natively in most
> browsers; verify on touch, and if you implement it in JS use `pointerdown`/`pointerup` +
> `setPointerCapture` — **not** `pointerleave`.

---

## 9. Disabled-state styling

Footer buttons in attract mode are non-interactive:

| Layer | Enabled | Disabled |
|---|---|---|
| Button background | normal sprite | Unity's own tint (SpriteSwap leaves normal sprite) |
| `button-text` | alpha **1.0** | alpha **0.3** |
| `icon` | alpha **1.0** | alpha **0.3** |

Only alpha changes — RGB is preserved.

```css
.btn:disabled .btn-label,
.btn:disabled .btn-icon { opacity: 0.3; }
```

---

## 10. Fonts observed in the scenes

| Font asset | Used for |
|---|---|
| `ConduitITC-Bold SDF` | All current UI text (labels, timer, high score, captions) |
| `Conduit ITC Regular SDF` | Body/secondary text |
| `LiberationSans SDF` | Unity default — only on **deprecated** elements (`[X]Header`, `ClosePreviewButton`) |

Font sizes seen on Puzzle_Screen: **112** (START), **100** (timer), **83** (caption), **82**
(high-score value), **68** (button labels), **62** (artwork title, runtime), **48** (HIGH SCORE label).

These are reference-resolution px on a 3840-tall canvas — scale them with the same `scaleFactor`
as everything else (see the replication doc), **not** with browser `rem` defaults.

---

## 11. Colours observed (map to brand palette)

| Hex | Where | Brand match |
|---|---|---|
| `#FFFFFF` | most text, backgrounds, sprite tints | white |
| `#E7B639` | "TAP THE TILES…" caption | ≈ amber — brand is `#FFA300` |
| `#DCB63C` | artwork title (runtime code) | ≈ amber — brand is `#FFA300` |
| `#67797F` | HighScoreBackground tint | slate grey (not in brand palette) |
| `#BF3B33` | ClosePreviewButton (deprecated) | ≈ red — brand is `#D50032` |
| `#000000` @ 0.86 | PreviewPanel backdrop | MAP Kohl |

**Recommendation:** during the port, replace the three near-amber values (`#E7B639`, `#DCB63C`)
with the exact brand **`#FFA300`** and define all colours as CSS custom properties so a brand
review is a one-file change.

---

## 12. Landscape vs Portrait

Same hierarchy, same components, same logic — **only geometry differs**. Notable deltas:

| | Portrait | Landscape |
|---|---|---|
| Canvas reference | 2160 × 3840 | 3840 × 2160 |
| Background sprite | `Background_Portrait.png` | landscape variant |
| Board position | `boardPanelPositionPortrait` | `boardPanelPositionLandscape` |
| Footer arrangement | stacked below board | alongside the board |
| Button transitions | already **SpriteSwap** | were **ColorTint** — being migrated |

Implement one component tree and drive layout with an orientation flag + two geometry tables.
Diff [ui/scene-portrait.md](ui/scene-portrait.md) against
[ui/scene-landscape.md](ui/scene-landscape.md) for exact per-element values.

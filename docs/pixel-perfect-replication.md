# Pixel-Perfect Replication Guide

How to reproduce the Unity kiosk UI **exactly** in React + Tauri. This is the coordinate-system
contract; per-element numbers live in [ui/scene-portrait.md](ui/scene-portrait.md) and
[ui/scene-landscape.md](ui/scene-landscape.md).

Follow this document literally and the port will be measurably 1:1, not approximately similar.

---

## 1. The scaling model (get this right first — everything else follows)

Unity does **not** lay out in device pixels. It lays out in a fixed **reference resolution** and
multiplies the whole canvas by one uniform scale factor.

| Scene | Reference resolution |
|---|---|
| Portrait | **2160 × 3840** |
| Landscape | **3840 × 2160** |

Mode: `ScaleWithScreenSize`, `MatchWidthOrHeight`, **match = 0.5**. The factor is a
**logarithmic** blend of both axes:

```
logWidth  = log2(screenWidth  / refWidth)
logHeight = log2(screenHeight / refHeight)
logWeighted = lerp(logWidth, logHeight, match)     // match = 0.5 → simple average
scaleFactor = pow(2, logWeighted)
```

With `match = 0.5` this is exactly the **geometric mean** of the two axis ratios:

```
scaleFactor = sqrt( (screenW / refW) × (screenH / refH) )
```

### 1.1 Implement it once, in CSS

Build the entire UI at reference size and scale it as a unit. Never re-derive sizes per element.

```tsx
const REF = { w: 2160, h: 3840 };          // portrait; swap for landscape

function useScaleFactor() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => {
      const s = Math.sqrt((innerWidth / REF.w) * (innerHeight / REF.h)); // match = 0.5
      setScale(s);
    };
    update();
    addEventListener('resize', update);
    return () => removeEventListener('resize', update);
  }, []);
  return scale;
}
```

```tsx
<div className="viewport">                     {/* fills the window, overflow hidden */}
  <div
    className="canvas"
    style={{
      width:  REF.w,                            /* literal reference px */
      height: REF.h,
      transform: `translate(-50%, -50%) scale(${scale})`,
      position: 'absolute', left: '50%', top: '50%',
      transformOrigin: 'center',
    }}
  >
    {/* every child positioned in reference pixels — 1 unit = 1 Unity unit */}
  </div>
</div>
```

**Consequence:** inside `.canvas` you can paste Unity numbers verbatim — `size=(124,124)` becomes
`width:124px; height:124px`. No conversion, no rounding drift, no per-element media queries.

> Use `transform: scale()`, **not** `zoom` and not `rem` scaling. `scale()` is GPU-composited,
> preserves sub-pixel geometry, and scales text metrics identically to Unity's SDF scaling.
> `zoom` re-runs layout and rounds to integer px, which visibly breaks parity.

### 1.2 A note on the "Expand" canvas

The overlay canvas uses `matchMode = 2` (Expand, match `0`), i.e.
`scaleFactor = min(screenW/refW, screenH/refH)` — it never crops. Only relevant if you replicate
that overlay separately; the main UI uses the geometric-mean formula above.

---

## 2. Axis conventions — the one thing that will bite you

| | Unity UI | CSS / DOM |
|---|---|---|
| Origin | bottom-left | top-left |
| +Y | **up** | **down** |
| Anchors | normalized `(0,0)`→`(1,1)`, Y up | percentages, Y down |
| Rotation | counter-clockwise positive | clockwise positive |

Three rules that cover every case:

1. **Vertical anchor flip:** `cssTop% = (1 − unityAnchorMax.y) × 100`
2. **Vertical offset flip:** a Unity `pos.y = +60` moves **up** → CSS `translateY(−60px)`
3. **Grid Y is already top-down** in `GameManager` (`y = 0` is the top row), so board/grid maths
   ports **without** any flip. Only `RectTransform` values flip. Do not double-negate.

---

## 3. RectTransform → CSS, mechanically

### 3.1 Full stretch (`anchorMin=(0,0)`, `anchorMax=(1,1)`, `size=(0,0)`)

```css
position: absolute; inset: 0;
```

With a negative `size` component = stretch minus margin. `size=(0,−1680)` →

```css
position: absolute; left: 0; right: 0;
top: 840px; bottom: 840px;   /* 1680 split across both edges (pivot 0.5) */
```

### 3.2 Fractional anchors (Idiom A — most of this UI)

```
anchorMin=(axMin, ayMin)  anchorMax=(axMax, ayMax)  size=(0,0)  pos=(0,0)
```

```css
position: absolute;
left:   calc(axMin * 100%);
width:  calc((axMax − axMin) * 100%);
top:    calc((1 − ayMax) * 100%);     /* Y flip */
height: calc((ayMax − ayMin) * 100%);
```

Worked example — `StartPuzzleButton` `(0.233, 0.3202)–(0.4766, 0.3707)`:

```css
.start-button {
  position: absolute;
  left: 23.300%;  width: 24.360%;
  top:  62.930%;  height: 5.050%;     /* top = (1 − 0.3707) × 100 */
}
```

### 3.3 Point anchor + fixed size (Idiom B)

```
anchorMin == anchorMax == (ax, ay)   size=(w, h)   pos=(px, py)   pivot=(vx, vy)
```

```
cssLeft = ax × parentW + px − vx × w
cssTop  = (1 − ay) × parentH − py − (1 − vy) × h
```

Worked example — `BackButton` `anchor (0, 0.5)`, `pos (40, 60)`, `size 124×124`, `pivot (0, 0.5)`:

```
cssLeft = 0 + 40 − 0×124              = 40px
cssTop  = 0.5×parentH − 60 − 0.5×124  = 50% − 122px
```

```css
.back-button {
  position: absolute;
  left: 40px;
  top: calc(50% - 122px);
  width: 124px; height: 124px;
}
```

### 3.4 Reference table

| Unity | CSS |
|---|---|
| `size=(0,0)` + stretch anchors | `inset: 0` |
| `sizeDelta` positive | explicit `width`/`height` in px |
| `sizeDelta` negative | stretch minus that many px total |
| `pivot` | subtract `pivot.x × w`; use `(1 − pivot.y) × h` vertically |
| `localScale` | `transform: scale()` (rare here — nearly all are `1`) |
| sibling order | later sibling = **on top** → higher `z-index` / later in DOM |
| `raycastTarget = false` | `pointer-events: none` |
| `preserveAspect` | `object-fit: contain` |
| `CanvasGroup.alpha` | `opacity` |
| `CanvasGroup.blocksRaycasts` | `pointer-events: auto\|none` |
| 9-sliced sprite | `border-image` (or `border-image-slice`) |

---

## 4. Text parity (TextMeshPro → CSS)

TMP renders SDF text; the browser renders hinted glyphs. Rules to stay 1:1:

1. **Font size is reference px** — put it inside the scaled `.canvas`, so `font-size: 68px`
   scales with everything else. Never use `rem`.
2. **Ship the same fonts** — Conduit ITC Regular/Bold as `woff2`. Metrics differ between
   foundries; a substitute font breaks line breaks and centring.
3. **Uppercase via CSS** — labels are authored lowercase (`preview`, `new image`) and appear
   uppercase. Use `text-transform: uppercase`, keep the source strings unchanged.
4. **Vertical centring**: TMP `Middle` centres on the **cap/ascender box**, CSS `line-height`
   centres on the em box — a small offset. For single-line labels use
   `display: flex; align-items: center; justify-content: center` on the parent instead of
   `line-height`.
5. **Alignment map**: TMP `Left|Middle` → `text-align: left` + flex centre;
   `Center|Middle` → `text-align: center`.
6. **Overflow**: TMP `Truncate` → `overflow: hidden` (no ellipsis);
   TMP `Ellipsis` → `text-overflow: ellipsis; white-space: nowrap; overflow: hidden`.
7. **Word wrap**: TMP `Normal` → `overflow-wrap: break-word`.
8. Disable synthetic bold — load the real Bold face and set `font-weight: 700` against it, or
   browsers will smear a faux-bold that doesn't match the SDF asset.

```css
:root { --font-display: 'Conduit ITC', system-ui, sans-serif; }
.label {
  font-family: var(--font-display); font-weight: 700;
  font-size: 68px;                    /* reference px, inside .canvas */
  text-transform: uppercase;
  display: flex; align-items: center; justify-content: center;
  -webkit-font-smoothing: antialiased;
}
```

---

## 5. The puzzle board (runtime geometry, not scene geometry)

The board is **not** authored in the scene — `GameManager` sizes it every build. Replicate the maths:

```ts
const PADDING_FACTOR = 0.9;
const TILE_SPACING   = 2;       // reference px
const COLS = 3, ROWS = 3;

const boardSize = Math.min(parentW, parentH) * PADDING_FACTOR;   // always square
const cellSize  = (boardSize - TILE_SPACING * (COLS - 1)) / COLS;

// top-left origin — matches CSS directly, no Y flip
const cellPos = (col: number, row: number) => ({
  x: col * (cellSize + TILE_SPACING),
  y: row * (cellSize + TILE_SPACING),
});
```

Layer order inside the board (bottom → top), matching Unity sibling order:

```
1. Outline      full board + 2px margin on every side, white, pointer-events: none
2. Tiles        cellSize², positioned absolutely
3. EmptySlot    invisible placeholder (gains the 9th slice on win)
4. Arrows ×4    cellSize × 0.38, on the empty cell's edges
```

Sibling: `BoardPanel_Container` (holding `ArtworkName`) mirrors the board rect and renders **above** it.

### 5.1 Tile image slicing without cutting bitmaps

Use one background image per tile, offset by the tile's **CorrectCell**:

```css
.tile {
  position: absolute;
  width: var(--cell); height: var(--cell);
  background-image: var(--artwork);
  background-size: calc(var(--cell) * 3) calc(var(--cell) * 3);   /* cols × rows */
  background-position: calc(var(--col) * var(--cell) * -1)
                       calc(var(--row) * var(--cell) * -1);
}
```

`--col`/`--row` come from `CorrectCell`; the tile's **screen position** comes from `CurrentCell`.
No Y inversion (unlike Unity's texture slicing, which inverts because texture Y is bottom-up).

### 5.2 Arrow placement

```ts
const half      = (cellSize + TILE_SPACING) / 2;
const arrowSize = cellSize * 0.38;
// CSS Y is already downward → do NOT negate dir.y (Unity does)
const pos = {
  x: emptyPos.x + dir.x * half,
  y: emptyPos.y + dir.y * half,
};
```

---

## 6. Animation parity

Match durations exactly; map DOTween easing to CSS:

| DOTween | CSS `cubic-bezier` | Notes |
|---|---|---|
| `Linear` | `linear` | exact |
| `OutCubic` | `cubic-bezier(0.215, 0.61, 0.355, 1)` | tile slide |
| `OutQuad` | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | fade out |
| `InQuad` | `cubic-bezier(0.55, 0.085, 0.68, 0.53)` | fade in |

```css
.tile { transition: transform 140ms cubic-bezier(0.215, 0.61, 0.355, 1); }

@keyframes arrow-pulse { from { transform: scale(1); } to { transform: scale(1.06); } }
.arrow { animation: arrow-pulse 250ms linear infinite alternate; }   /* Yoyo = alternate */
```

Animate tiles with `transform: translate3d()` (compositor-only), **not** `left/top`.
`Yoyo` ↔ `animation-direction: alternate`; `SetLoops(-1)` ↔ `infinite`.

Full timing table: [ui-spec.md §8](ui-spec.md#8-animation-sequences-complete-inventory).

---

## 7. Tauri kiosk configuration

```jsonc
// tauri.conf.json
{
  "app": {
    "windows": [{
      "fullscreen": true,
      "decorations": false,        // no title bar — visitors must not close it
      "resizable": false,
      "alwaysOnTop": true,
      "width": 2160, "height": 3840
    }],
    "security": { "csp": "default-src 'self'; img-src 'self' https: data:; connect-src 'self' https: wss:" }
  }
}
```

Also do:

- **Disable the context menu and text selection** — `user-select: none`, block `contextmenu`.
- **Disable zoom gestures** — `touch-action: manipulation` (except the crop canvas, which needs
  `touch-action: none` for pinch handling).
- **Disable overscroll/bounce** — `overscroll-behavior: none`, `overflow: hidden` on `html, body`.
- **Hide the caret** where inputs aren't wanted; keep it in the search field.
- **Keep an exit hatch for staff** — the Unity build uses double-Esc (`QuitOnDoubleEsc`).
  Reimplement it (e.g. double-Esc within 1 s, or a hidden 4-corner tap) or you cannot close the kiosk.
- **Proxy the collection API through Rust** so the API key never reaches the renderer
  (see [game-logic.md §8.1](game-logic.md#81-security--read-before-writing-code)).

---

## 8. Asset export from Unity

All UI sprites live in `Assets/Games/Sliding-Puzzle/UI/` (notably `UI/GamePlayScreen/`).

| Asset kind | Export as |
|---|---|
| Buttons, icons, logo | original **PNG** (already authored at 4K — do not downscale) |
| Backgrounds | PNG (portrait + landscape variants) |
| 9-sliced (`Circle_9Sliced.png`) | PNG + record the slice borders → CSS `border-image-slice` |
| Fonts | licensed **woff2** (Conduit ITC Regular + Bold) |

Naming convention to preserve: `<Button>.png` / `<Button>-pressed.png`
(note the inconsistent case — `ResetButton-Pressed.png` vs `PreviewButton-pressed.png`;
normalise during export and update references).

Keep the pressed-state sprites — the port's `:active` styling depends on them.

---

## 9. Verification — prove parity, don't eyeball it

1. **Reference captures.** Run the Unity build at exactly 2160×3840 and 3840×2160; screenshot
   every screen and both button states (normal/pressed, enabled/disabled).
2. **Match the port.** Run the Tauri window at the same size; capture the same screens.
3. **Diff numerically.** Compare with a perceptual diff (e.g. `pixelmatch`, ImageMagick
   `compare -metric AE`). Target **< 1 % differing pixels**, with differences confined to text
   antialiasing.
4. **Overlay test.** Blend the two captures 50/50 — misaligned geometry shows instantly as ghosting.
5. **Scale sweep.** Test 1080p, 1440p and 4K. Every element must stay in the same *relative*
   position; only the uniform scale factor changes.
6. **Checklist per screen:** board centred and square · footer buttons evenly spaced · artwork
   title 10 px above the board · timer/START mutually exclusive · disabled labels at 0.3 alpha ·
   press offset exactly 10 px down-left.

### Quick diff harness

```bash
# capture both, then:
magick compare -metric AE unity_portrait.png tauri_portrait.png diff.png
# AE = number of differing pixels; 2160×3840 = 8,294,400 total → 1% ≈ 83,000
```

---

## 10. Recommended structure for the port

```
src/
├── canvas/
│   ├── ScaledCanvas.tsx        // §1 scale wrapper (the only place scaling exists)
│   └── useScaleFactor.ts
├── screens/
│   ├── PuzzleScreen/           // board, footer, timer, high score
│   ├── ImageSelectScreen/
│   ├── BrowseScreen/           // search, filters, pagination, card grid
│   ├── CropScreen/             // canvas pan/zoom/rotate
│   └── WinScreen/
├── game/
│   ├── board.ts                // grid model, cell maths
│   ├── shuffle.ts              // move-based shuffle (solvable by construction)
│   ├── moves.ts                // adjacency, move execution, win check
│   └── highScore.ts            // per-artwork persistence
├── api/
│   ├── client.ts               // fetch + abort/request-id guard
│   ├── types.ts               // MAPData, ResultsData, Pagination, Filters
│   └── socket.ts               // socket.io "new-upload"
├── ui/
│   ├── Button.tsx              // SpriteSwap + press offset + disabled alpha
│   └── tokens.css              // brand colours, fonts, spacing
└── layout/
    ├── portrait.ts             // geometry table (from ui/scene-portrait.md)
    └── landscape.ts            // geometry table (from ui/scene-landscape.md)
```

Keep geometry in **data tables**, not scattered CSS — that keeps the two orientations honest and
makes regenerating from Unity mechanical.

---

## 11. Regenerating the element dumps

The two `ui/scene-*.md` files are generated from the Unity scene YAML by `extract_ui.py`
(kept in the session scratchpad; move it into `tools/` if you want it version-controlled). It parses
`RectTransform`, `Image`, `TMP_Text`, `Button`, `CanvasScaler` and `GridLayoutGroup` and resolves
sprite/font GUIDs to filenames.

Re-run it whenever the scenes change, so the port always diffs against current truth.

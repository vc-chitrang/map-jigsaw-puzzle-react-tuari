# Game Logic, Algorithms & API — implementation spec

Everything needed to reimplement behaviour **exactly**. Source of truth: `Scripts/GameManager.cs`
(1235 lines), `Scripts/TileController.cs`, `Scripts/ArrowController.cs`, `Scripts/WinScreen.cs`,
`Scripts/UI/CollectionUIManager.cs`, `Scripts/API/*`, `Scripts/SocketIO/SocketConnection.cs`.

---

## 1. Board model

### 1.1 Grid and coordinates

```
Grid size: 3 × 3   (predefinedBoardSize, isBoardSizePredefined = true)
Cell coords: Vector2Int(x, y)
  x = column, 0 → left
  y = row,    0 → TOP        ← grid Y is TOP-DOWN
```

> **Critical for the port:** grid Y increases *downward*, while Unity UI Y increases *upward*.
> Every grid→screen conversion negates Y. In CSS/DOM, Y already increases downward — so the
> negation **disappears**. Do not copy the minus signs blindly.

Auto-sizing is disabled but preserved in code (`DetermineGridSize`) — if ever re-enabled:

| Image aspect | Grid |
|---|---|
| `width > height` | 4 × 3 |
| `height > width` | 3 × 4 |
| square | 4 × 4 |

### 1.2 Tile identity

Tiles are created in row-major order, **skipping the bottom-right cell**, which becomes the
initial empty slot:

```
_emptyCell = (size.x - 1, size.y - 1)      // (2,2) for 3×3
tileIndex increments 0..7 in row-major order, skipping the empty cell
```

Each tile stores:

| Field | Meaning |
|---|---|
| `Index` | Creation order (0..7) |
| `CorrectCell` | Where it belongs (its spawn cell) |
| `CurrentCell` | Where it is now |
| `IsInCorrectPosition` | `CurrentCell == CorrectCell` |

An invisible `EmptySlot` GameObject occupies the empty cell so the grid layout stays consistent.

### 1.3 Board geometry

```
boardSize = min(parentWidth, parentHeight) × boardPaddingFactor   // boardPaddingFactor = 0.9
board is always a perfect square, anchored centre (0.5, 0.5)
anchoredPosition = boardPanelPositionPortrait | boardPanelPositionLandscape

tileSpacing = 2 px  (reference-resolution px)
cellSize = (boardSize − tileSpacing × (cols − 1)) / cols
```

Cell anchored positions are produced by a `GridLayoutGroup`
(`FixedColumnCount`, `startCorner = UpperLeft`, `startAxis = Horizontal`, padding 0), then
**cached** (`CacheGridPositions`) and the layout group is **disabled** so tiles can be tweened
freely. Port equivalent: compute positions yourself:

```ts
// top-left origin, matches CSS directly
const x = col * (cellSize + spacing);
const y = row * (cellSize + spacing);
```

An `Outline` image is inserted as the **first** child of the board (behind tiles), stretched with
a `tileSpacing` (2 px) margin on all sides, white, `raycastTarget = false`.

---

## 2. Image → tiles

### 2.1 Square crop

Non-square source images are centre-cropped to 1:1 before building
(`CropToSquare`): `size = min(w,h)`, `offset = ((w−size)/2, (h−size)/2)`.

### 2.2 Slicing (integer pixel boundaries)

Fractional slicing caused out-of-bounds rects, so boundaries are rounded to integers and clamped.
For cell `(x, y)` of a `tex.width × tex.height` image:

```
left   = round(x       / cols × texWidth)
right  = round((x + 1) / cols × texWidth)

// texture Y is bottom-up, grid Y is top-down → invert the row
bottom = round((rows − 1 − y) / rows × texHeight)
top    = round((rows − y)     / rows × texHeight)

clamp: left∈[0,w]; right∈[left+1,w]; bottom∈[0,h]; top∈[bottom+1,h]
```

**Port note:** in a browser you don't need to slice at all. Render one image per tile with
`background-image` + `background-size: (cols*100)% (rows*100)%` and
`background-position: -(col × cellSize)px -(row × cellSize)px`, using the tile's **CorrectCell**
for the offset. No Y inversion needed. This is faster and avoids 9 bitmap copies.

---

## 3. Shuffle algorithm

Shuffling is **move-based, never index-permutation** — this guarantees solvability by
construction (no parity check needed).

```
moves = max(12, cols × rows × shuffleMoveMultiplier)      // shuffleMoveMultiplier = 3
                                                          // 3×3 → max(12, 27) = 27
prevEmpty = (-100, -100)

repeat `moves` times:
    candidates = movable cells adjacent to empty (up/down/left/right, inside grid, has tile)
    if candidates.count > 1: remove prevEmpty      // avoid immediately undoing the last move
    if candidates.empty: continue
    chosen = random from candidates
    prevEmpty = empty
    move chosen tile into empty INSTANTLY (no tween)

if board is now solved: recurse (shuffle again)
```

> The recursion on an accidentally-solved board is unbounded in theory. In the port, prefer a
> bounded retry (e.g. loop up to 10×) to remove any stack-overflow risk.

---

## 4. Movement & win detection

### 4.1 Input paths

Two ways to move (both funnel into `TryMoveTileAt`):

1. **Arrow buttons** — 4 arrows positioned on the empty cell's edges.
2. **Direct tile tap** — tap any tile; moves only if adjacent to the empty cell.

Both call `ExitLaunchMode()` **first** (first interaction leaves attract mode), then reject input if
`_isAnimating || _isSolved || IsPreviewVisible`.

### 4.2 Move validation & execution

```
AreAdjacent(a, b) := |a.x − b.x| + |a.y − b.y| == 1     // Manhattan distance of exactly 1
```

`MoveTileRoutine` order of operations (**state updates happen BEFORE the animation**):

```
1. _isAnimating = true
2. hide all arrows
3. destCell = empty
   tilesByCell.remove(sourceCell); tilesByCell[destCell] = tile
   empty = sourceCell; tile.CurrentCell = destCell
4. if playerMove && !timerRunning: timerRunning = true    ← timer starts on FIRST player move
5. await tween: anchoredPosition → destCell position (0.14 s, Ease.OutCubic)
6. if playerMove: moveCount++
7. isSolved = CheckSolved()
   if solved:  timerRunning = false; UpdateHighScore();
               status = "Solved in {moveCount} moves";
               RevealLastMissingTile(); → after 1 s realtime: show preview + WinScreen
   else:       status = "Moves: {moveCount}"; UpdateArrows()
8. _isAnimating = false
```

### 4.3 Win detection

```
CheckSolved() := every spawned tile has CurrentCell == CorrectCell
```

The empty cell is **not** checked — with 8 of 9 tiles correct the 9th is implied.

On win, `RevealLastMissingTile()` adds an `Image` to the `EmptySlot` object using the
bottom-right slice, completing the picture.

### 4.4 Timer

```
Update(): if timerRunning && !isSolved: elapsedSeconds += deltaTime; render mm:ss
```

Starts on the **first player move** (not on screen entry), stops on solve.
Format: `{totalSeconds/60:00}:{totalSeconds%60:00}`, floored; `-1` renders as `--:--`.

---

## 5. Arrow system

4 arrows, created as children of the board with `LayoutElement.ignoreLayout = true`, anchored
top-left `(0,1)`, forced to render last (on top of tiles).

Direction table — **offset from the empty cell to the tile that arrow pulls in**:

| Index | Grid offset | Meaning |
|---|---|---|
| 0 | `(0, −1)` | tile visually **above** |
| 1 | `(0, +1)` | tile visually **below** |
| 2 | `(−1, 0)` | tile to the **left** |
| 3 | `(+1, 0)` | tile to the **right** |

Placement (`UpdateArrows`) — each arrow sits on the **edge between** the empty cell and its neighbour:

```
half      = (cellSize + tileSpacing) / 2
arrowSize = cellSize × arrowSizeFactor          // arrowSizeFactor = 0.38
offset    = (dir.x × half, −dir.y × half)       // NOTE: Y negated (grid is top-down)
position  = emptyCellPosition + offset
visible   = neighbour is inside grid AND has a tile
```

In CSS (Y already downward) use `offset = (dir.x × half, dir.y × half)` — **drop the negation**.

Arrows are hidden during animation and stay hidden after a win.

**Idle pulse animation:** while visible, `scale 1 → 1.06`, **0.25 s**, `Ease.Linear`,
`loops = −1` with `Yoyo` (ping-pong). Killed on hide/destroy; scale reset to 1.

---

## 6. Modes & state machine

### 6.1 Launch (attract) mode vs gameplay

`_isLaunchMode = true` on boot until the first tile/arrow interaction or a cropped sprite loads.

**Auto-shuffle preview** (launch mode only) — `AutoShuffleRoutine`:

```
every 1.0 s while launch mode:
    skip if board not visible in hierarchy
    skip if animating or no tiles
    candidates = movable cells; if >1, remove lastAutoMoveFrom (no immediate reversal)
    animate one random tile (0.14 s) — does NOT start timer, count moves, or check solved
    reposition arrows afterward
```

UI differences by mode (`UIManager`):

| | Launch mode | Gameplay |
|---|---|---|
| START button | visible | hidden |
| Timer | hidden | visible |
| Footer buttons (Reset/Preview/New Image) | `interactable = false`, label+icon **alpha 0.3** | `interactable = true`, alpha 1.0 |

### 6.2 Mode transitions

| Trigger | Effect |
|---|---|
| First tile/arrow tap | `ExitLaunchMode()` → stop auto-shuffle, gameplay UI |
| `StartPuzzleWithCroppedSprite` | `ExitLaunchMode()`, build from crop |
| "New Image" | `ResetToLaunchMode(false)` → new random API image, **attract mode** |
| WinScreen "Play Again" | `ResetToLaunchMode(true)` → new image, **straight into gameplay** (skips attract) |
| Home / back to Puzzle | `ResetToLaunchMode()` via `ScreenManager.GoHome()` |

The `startGameplayImmediately` flag is consumed by `ConsumeStartGameplayFlag()` after the image loads.

### 6.3 Screen navigation (`ScreenManager`)

Stack-based with custom back rules and a **cross-fade** through a full-screen black overlay:

```
fadeDuration = 0.2 s per half (total 0.4 s)
sequence: overlay alpha 0→1 (Ease.OutQuad)
          → swap screens (deactivate outgoing, activate incoming)
          → overlay alpha 1→0 (Ease.InQuad)
          → overlay deactivated, blocksRaycasts = false
```

Custom back rules (`useCustomBackRules = true`):

| From | Back goes to |
|---|---|
| Browse | ImageSelectOrUpload |
| Crop | Browse (if it came from Browse) else ImageSelectOrUpload |
| ImageSelectOrUpload | Puzzle (+ reset to launch mode) |
| Puzzle | reset to launch mode if mid-game, else **quit app** |

> **Port the overlay carefully.** In Unity, an interrupted tween could leave the overlay
> `blocksRaycasts = true`, making the whole UI unclickable — a real bug that was fixed by
> guarding the swap and cleaning up on both complete *and* kill. In React, model the transition
> as explicit state (`idle | fadingOut | fadingIn`) with a timeout fallback so a dropped
> `transitionend` can never wedge the app.

---

## 7. Persistence (high score)

```
key   = "{productName}_HighScoreKey_{imageIdentifier}"
imageIdentifier = artworkTitle (if non-empty) else textureName else "Default"
value = float seconds (PlayerPrefs)
read  = PlayerPrefs.GetFloat(key, -1f)      // -1 ⇒ no record ⇒ render "--:--"
write = only if best < 0 || elapsed < best  // lower is better
```

So the high score is **per artwork title**, not global, and not per grid size.

Port: `localStorage` (or Tauri store for kiosk-resilient storage). Keep the same key shape so
existing kiosk records survive if the data is migrated.

---

## 8. API contract

### 8.1 Security — read before writing code

The Unity source hardcodes the collection **API key** in `Scripts/API/API.cs` and the base URL is
a private backend. **Do not carry that pattern into the port and do not commit the key.**

- Put base URL + key in **environment/config** (`.env`, Tauri config, or a runtime config file).
- Ideally proxy the call through the **Tauri Rust side** so the key never reaches renderer JS or
  DevTools.
- Add the config file to `.gitignore`. Rotate the existing key if it has been committed publicly.

Placeholders used below: `{{API_BASE_URL}}`, `{{API_KEY}}`.

### 8.2 Endpoints

| Purpose | Method | Path |
|---|---|---|
| OAuth login | POST | `{{API_BASE_URL}}oauth/token` |
| Collection / artwork | GET | `{{API_BASE_URL}}api/public_hook/v1/artwork?key={{API_KEY}}` |

There are two configurable server profiles (`Live`, `Development`) which currently point at the
**same** base URL.

> **VERIFIED AGAINST THE LIVE API, 2026-07-29 — the login step is REQUIRED.**
>
> The collection endpoint returns **HTTP 500** when called with only `?key=`, and **HTTP 200** once
> an `Authorization: Bearer <access_token>` header is added. Both the key *and* the token are needed.
> This is easy to miss because the Unity code never sets the header explicitly — `LoginHandler`
> assigns `ServerCommunication.ViitorCloudToken`, and that lives inside `API-Machanisam.dll`, which
> attaches the header to every subsequent request.
>
> **Login request** — `POST {{API_BASE_URL}}oauth/token`, `Content-Type: application/json`
> (Unity uses `JsonUtility.ToJson(loginData)`, so it is a JSON body, not a form):
>
> ```json
> { "grant_type": "client_credentials", "client_id": "…", "client_secret": "…",
>   "username": "", "password": "", "scope": "read-artwork read-department" }
> ```
>
> `username` and `password` are **empty** — the grant is `client_credentials`. The credentials are
> serialized on the `LoginHandler` component **in the scene**, not in source.
>
> **Login response** — `{ token_type, expires_in, access_token }`. Observed `expires_in` is
> **2,592,000 s (30 days)**, so in practice this is one login per boot. The port caches the token in
> the Rust side with a 5-minute safety margin.
>
> **Observed response facts** (`limit=3`): `total` **32,305**, `last_page` 10,769. Filter option
> counts: department **6**, classification **339**, artist **2,022**, culture **1,789**, date **741**
> — which is why the filter dropdowns must be searchable rather than scrollable.
>
> **First request took ~8 s.** A spinner is not optional, and the 20 s client timeout is deliberate.
>
> Re-check any time with `powershell -File scripts/check-api.ps1`, which prints status and shape
> facts but never a URL, key or token.

### 8.3 Boot sequence

```
LoginHandler → onLoginSuccess → APIHandler.FetchDefaultData()
    → GET artwork (no extra params → first page + filters)
    → APIHandler.LastFetchedData = response          (cached statically)
    → OnAPIDataFetchedEvent.Invoke(response)         (broadcast)
```

`LastFetchedData` exists so screens activated *after* the event still get data. Port equivalent:
a React context / store holding `lastFetchedData`, not an event-only bus.

### 8.4 Collection query (Browse screen)

`BuildCollectionURL()` appends to the base:

| Param | Value | Condition |
|---|---|---|
| `limit` | `_itemsPerPage` (**default 40**) | always |
| `page` | `_currentPage` (1-based) | always |
| `q` | URL-encoded search text | if non-empty |
| `department` | id | if `> 0` |
| `classification` | id | if `> 0` |
| `artist` | id | if `> 0` |
| `culture` | URL-encoded string | if non-empty |
| `date` | URL-encoded string | if non-empty |
| `sortBy` + `sortOrder` | see table | if sort mode > 0 |

Sort modes (index → field): `["", "artist", "artist", "date", "date"]` with matching
`SortOrders` — i.e. index 0 is default/unsorted, 1–2 sort by artist asc/desc, 3–4 by date asc/desc.

**Race-condition guard (important):** every fetch increments `_fetchId`; the response handler
runs only if `_fetchId` still matches the id captured at request time. Stale responses are
discarded. In-flight card image downloads are also cleared before a new fetch to free bandwidth.
Port this with `AbortController` + a request id.

### 8.5 Response shape

```ts
type MAPData = {
  results: {
    data: ResultsData[];
    pagination: {
      total: number; count: number; per_page: number;
      current_page: number; last_page: number; to: number; from: number;
    };
  };
  filters: {
    classification: { id: number; class: string;  period: string }[];
    department:     { id: number; dept: string;   period: unknown }[];
    artist:         { id: number; name: string; bio: string; role: string; display_order: number }[];
    culture:        { id: number; culture: string; period: string }[];
    date:           { id: number; date: string;  period: string }[];
  };
};

type ResultsData = {
  id: number; title: string; date: string; period: string;
  accession_number: string; medium: string; dimensions: string;
  status: string; public_access: number;
  primary_image: string;              // absolute URL — used for board + cards
  instance_id: number;
  department_id: number; department: string;
  signed: string; keywords: string; inscribed: string; paper_support: string;
  condition: unknown; attributes: unknown;
  artists: { id: number; name: string; bio: string; role: string; display_order: number }[];
};
```

Filters are populated once (`_filtersPopulated`), then only refreshed on later fetches.

### 8.6 Launch image selection

```
valid = results.data.filter(d => d.primary_image is non-empty)
chosen = valid[random]
artworkTitle = chosen.title ?? ""
load chosen.primary_image → crop to square → BuildPuzzle(shuffle: true)
```

Loads **once** per launch-mode session (guarded by `_isLaunchMode && _spawnedTiles.Count == 0`),
and aborts if the user interacted while the download was in flight.

---

## 9. Realtime: phone upload via QR

`SocketConnection` (Socket.IO v3, **polling transport**):

```
URL   : https://i-am-puzzle.map-india.org
header: Origin: <same URL>
event : "new-upload"  →  payload contains an image URL  →  OnImageUrlReceived(url)
```

Consumer (`UIManager.OnImageReceived`) accepts the upload **only if** the
ImageSelectOrUpload screen **or** the Crop screen is currently visible — this lets a visitor scan
a second QR while already cropping, replacing the image in place. Then:

```
download → sprite → clear artwork metadata (title stays empty for QR uploads)
         → ImageCropper.SetSpriteForImageToCrop(sprite)
         → ScreenManager.ShowScreen(cropScreen)
```

Port with `socket.io-client` (`transports: ['polling']` to match), same visibility gate.

---

## 10. Crop screen behaviour

> ⚠️ **CORRECTED 2026-07-29 — see [ADR-017](decisions.md).** The pan/pinch-zoom description below is
> wrong. The scene has **no `PinchableScrollRect`**, and `ResetZoomButton`/`ZoomSlider` are children
> of `[X]DisableButtons`, which is **inactive** — they do not ship.
>
> What actually ships is `CropGridResizer`: *"a resizable square crop grid with 4 corner drag
> handles"*. The image is displayed fitted and never pans or zooms; the visitor resizes and moves a
> square selection over it.
>
> * Grid starts as the largest square fitting the **visible** (letterboxed) image, centred.
> * A corner drag resizes about the **opposite** corner, which stays fixed. Always square.
> * Size clamps to `[0.2 × initial, initial]` (`minSizeFraction = 0.2`).
> * Handles: 80 px, white at alpha 0.9 (`handleVisualSize`, `handleColor`).
> * Grid body drags to move, clamped inside the visible image.

- ~~Pan / pinch-zoom via `PinchableScrollRect` + `ImageZoomController` (zoom slider; the reset
  button is disabled once zoom < 0.99).~~ **Does not ship — see the note above.**
- **Rotate**: visual tween `±90°` over **0.3 s**, `Ease.Linear`, *then* commits the pixel rotation.
- Output is a **square** sprite handed to `GameManager.StartPuzzleWithCroppedSprite(sprite, title)`.
- `CropGridResizer` maintains the crop frame geometry.

Port: a `<canvas>` with a transform matrix (translate/scale/rotate); export via
`canvas.toBlob()` / `getImageData` at the crop rect.

---

## 11. Tunable constants (single reference table)

> ⚠️ **CORRECTED 2026-07-29 — see [ADR-015](decisions.md).** The values first recorded here were the
> **field initialisers** in `GameManager.cs`. Unity serializes the designer-tuned values into each
> scene, and those override the initialisers at runtime. The scene values are authoritative and are
> what `src/game/constants.ts` implements.
>
> | Constant | C# initialiser | **Portrait scene** | **Landscape scene** |
> |---|---:|---:|---:|
> | `boardPaddingFactor` | 0.9 | **0.704** | **0.68** |
> | `tileSpacing` | 2 | **6** | **6** |
> | `shuffleMoveMultiplier` | 3 | **1** → 12 moves | **1** → 12 moves |
> | `arrowSizeFactor` | 0.38 | **0.35** | **0.35** |
>
> Also missing from the original table:
> `boardPanelPosition` = **(0, 514)** portrait / **(0, 100)** landscape (Unity Y is up, so portrait
> sits 514 px *above* centre), and the `Outline` extends `tileSpacing` px **outward** on all sides —
> `SetFullStretch(rt, m)` uses `offsetMin = (−m,−m)`, `offsetMax = (+m,+m)`.
>
> **Rule for future work: read constants from the scene YAML, never from the C# initialiser.**

| Constant | Value | Where |
|---|---|---|
| Grid size | `3 × 3` | `predefinedBoardSize` |
| `boardPaddingFactor` | `0.9` *(scene: 0.704 / 0.68)* | board = that fraction of min(parent w,h) |
| `tileSpacing` | `2` px *(scene: 6)* | between tiles + outline overhang |
| `tileMoveDuration` | `0.14` s | tile slide, `Ease.OutCubic` |
| `shuffleMoveMultiplier` | `3` *(scene: 1 → 12 moves)* | `max(12, cols × rows × multiplier)` |
| `arrowSizeFactor` | `0.38` *(scene: 0.35)* | arrow size = that fraction of cell |
| Arrow pulse | `1 → 1.06`, `0.25` s, Linear, Yoyo ∞ | attention loop |
| Auto-shuffle interval | `1.0` s | launch mode only |
| Win screen delay | `1.0` s realtime | after last tile reveal |
| `fadeDuration` | `0.2` s ×2 | screen cross-fade |
| Rotation anim | `0.3` s, Linear | crop screen |
| Disabled label/icon alpha | `0.3` | footer buttons |
| Button press offset | `(−10, −10)` px | label+icon nudge while held |
| `_itemsPerPage` | `40` | collection page size |
| Card grid target cell | `320` px, min 2 columns | Browse grid |

---

## 12. Port checklist — logic parity tests

- [ ] Shuffled board is always solvable (move-based shuffle, never a random permutation).
- [ ] Shuffle produces an unsolved board (retry if solved).
- [ ] Only cells with Manhattan distance 1 from the empty cell can move.
- [ ] Timer starts on first **player** move; auto-shuffle moves don't start it.
- [ ] Auto-shuffle never immediately reverses its previous move.
- [ ] Win fires only when all 8 tiles are home; 9th slice is revealed.
- [ ] High score written only when strictly faster; `-1` renders `--:--`.
- [ ] High score key is per **artwork title**.
- [ ] Stale API responses are discarded (request-id/abort guard).
- [ ] QR upload accepted only on ImageSelectOrUpload/Crop screens.
- [ ] Input blocked while animating, solved, or preview visible.
- [ ] Screen transition can never leave an invisible click-blocking overlay.

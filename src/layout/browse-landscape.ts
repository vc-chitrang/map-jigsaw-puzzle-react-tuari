/**
 * Browse & Discover geometry — LANDSCAPE, 3840 × 2160.
 *
 * TRANSCRIBED VERBATIM from docs/ui/scene-landscape.md (lines 205-548), with TMP
 * margins and alignments, and the three layout groups, read from the scene YAML
 * directly — `extract_ui.py` reports none of those.
 *
 * SAME KNOWN GAP AS PORTRAIT: the artwork card comes from a prefab that is not in
 * the repository, so the card's INTERNAL geometry is unverified. The values are
 * shared with the portrait table rather than invented a second time.
 *
 * WHAT THE DUMP CANNOT TELL YOU (read from the YAML):
 *
 * * `FilterDropdowns` carries a `HorizontalLayoutGroup` (spacing **36**,
 *   childAlignment 4 = MiddleLeft, force-expand + control W/H all 1) plus an
 *   unconstrained `ContentSizeFitter`. **Portrait has the identical group**, so
 *   this is not an orientation difference — and in both scenes the serialized
 *   `pos`/`size` on the five dropdowns are exactly what that group last baked in
 *   (uniform 570.2043 px stride minus a 534.2043 px width = the 36 px spacing).
 *   The table therefore keeps the baked values, like portrait does, and they stay
 *   diffable against the dump.
 * * `PaginationBar` is a `HorizontalLayoutGroup` (spacing **30**, portrait's is
 *   **50**) with a PreferredSize `ContentSizeFitter` on both axes, and
 *   `PageNumbers` is a nested one (spacing 8, both orientations). The port draws
 *   only the page-info text, so the spacings are recorded but unused.
 * * `CardGrid` has NO `GridLayoutGroup` in either scene:
 *   `CollectionUIManager.SetupGridLayout` adds one at runtime with spacing 16 and
 *   padding (16, 16, 16, 40), and `UpdateGridCellSize` computes the cell from
 *   `targetCellSize = 320` and a 2-column minimum. Those live in `CARD_GRID`
 *   (browse.ts) because they are code, not scene, and identical for both builds.
 *
 * DIFFERENCES FROM PORTRAIT, all in numbers:
 *
 *   |                    | portrait | landscape |
 *   |---|---|---|
 *   | back button        | 124² at (40, 60) | **72²** at (60, 0) |
 *   | app logo           | top centre | **top right** |
 *   | search bar         | 0.0918-0.8958 / 0.8391-0.8573 | **0.1248-0.8414 / 0.8597-0.8877** |
 *   | clear-search width | 50 | **30** |
 *   | filter title       | 42 px at (0, 92) | **24.5 px at (0, 48.4)** |
 *   | clear filters      | 300 × 70 at (0, 18.77) | **300 × 54 at (0, 0)**, label 23 px |
 *   | dropdowns          | 332.1656 × 70, stride 368.1656 | **534.2043 × 56.3507, stride 570.2043** |
 *   | card panel inset   | −200 (100 per side) | **−150 (75 per side)** |
 *   | page arrows        | 100 wide, 581.4 tall | **75 wide, parent − 870** |
 *   | arrow sprite       | 60 px | **40 px** |
 *   | pagination bar     | 0.1163-0.9018 / 0.0446-0.0706 | **0.1349-0.8505 / 0.116-0.1623** |
 *
 * NOT PORTED, exactly as in portrait: `PerPageDD` (active at
 * 0.6079-0.6609 but its option list is in neither the scene nor the docs, so
 * `limit` stays at the documented 40) and `GridViewButton` (45² here, 60² in
 * portrait; there is only one view).
 */

import type { LayoutRect } from './rect';
import type { TextSpec } from './portrait';
import { CARD_GRID, CARD_INTERNALS, DROPDOWN_POPUP } from './browse';

export const BROWSE_LANDSCAPE = {
  screen: {
    rect: { kind: 'stretch' } satisfies LayoutRect,
    background: '/assets/common/background-landscape.png',
  },

  appLogo: {
    rect: {
      kind: 'fractional',
      anchorMin: { x: 0.868, y: 0.8511 },
      anchorMax: { x: 0.9337, y: 0.926 },
    } satisfies LayoutRect,
    sprite: '/assets/gameplay/map-logo.svg',
  },

  /** `BackButton.png` at alpha 0.85, as in portrait — Back, not Home. */
  backButton: {
    rect: {
      kind: 'point',
      anchor: { x: 0, y: 0.5 },
      pos: { x: 60, y: 0 },
      size: { x: 72, y: 72 },
      pivot: { x: 0, y: 0.5 },
    } satisfies LayoutRect,
    sprite: '/assets/gameplay/back-button.svg',
    opacity: 0.85,
  },

  searchBar: {
    rect: {
      kind: 'fractional',
      anchorMin: { x: 0.1248, y: 0.8597 },
      anchorMax: { x: 0.8414, y: 0.8877 },
    } satisfies LayoutRect,
    fieldRect: { kind: 'stretch' } satisfies LayoutRect,
    outlineColour: '#CCCCCC',
    /** Text Area is inset: pos (−20, 0), size (−80, 0) — same as portrait. */
    textAreaRect: { kind: 'stretch', size: { x: -80, y: 0 } } satisfies LayoutRect,
    input: { fontSizePx: 34, colour: '#262626' } satisfies TextSpec,
    placeholder: {
      fontSizePx: 34,
      colour: 'rgb(128 128 128 / 0.7)',
      text: 'Search...',
    } satisfies TextSpec,
    /**
     * A vertical band, not a square: the scene stretches it to the field height
     * and fixes only the width (30, versus portrait's 50). The portrait table
     * pre-resolved the equivalent rect to a point, which lands in the same place
     * because the sprite preserves its aspect.
     */
    clearButtonRect: {
      kind: 'verticalBand',
      anchorX: 1,
      anchorMinY: 0,
      anchorMaxY: 1,
      pos: { x: -15, y: 0 },
      size: { x: 30, y: 0 },
      pivot: { x: 1, y: 0.5 },
    } satisfies LayoutRect,
    clearSprite: '/assets/popup/icon-error.png',
    /** Sits OUTSIDE the field's right edge: pivot (0, 0.5) on anchor x = 1. */
    searchButtonRect: {
      kind: 'verticalBand',
      anchorX: 1,
      anchorMinY: 0,
      anchorMaxY: 1,
      pos: { x: 0, y: 0 },
      size: { x: 70, y: 0 },
      pivot: { x: 0, y: 0.5 },
    } satisfies LayoutRect,
    searchSprite: '/assets/browse/search-button.svg',
  },

  filterBar: {
    rect: {
      kind: 'fractional',
      anchorMin: { x: 0.1248, y: 0.8045 },
      anchorMax: { x: 0.8578, y: 0.8306 },
    } satisfies LayoutRect,
    titleRect: {
      kind: 'point',
      anchor: { x: 0, y: 1 },
      pos: { x: 0, y: 0 },
      size: { x: 300, y: 54 },
      pivot: { x: 0, y: 0 },
    } satisfies LayoutRect,
    /** 24.5 px — the only fractional font size in either scene. */
    title: { fontSizePx: 24.5, colour: 'var(--map-white)', text: 'Filter By' } satisfies TextSpec,
    clearFiltersRect: {
      kind: 'point',
      anchor: { x: 1, y: 1 },
      pos: { x: 0, y: 0 },
      size: { x: 300, y: 54 },
      pivot: { x: 1, y: 0 },
    } satisfies LayoutRect,
    clearFilters: {
      fontSizePx: 23,
      colour: 'var(--map-white)',
      /** TMP margin (0, 0, 10, 0) — a right margin, unlike portrait's none. */
      marginPx: { left: 0, top: 0, right: 10, bottom: 0 },
      text: 'Clear Filters',
    } satisfies TextSpec,
  },

  /**
   * The five dropdowns share a size and y; only `pos.x` differs. Stride is a
   * uniform 570.2043 px (= 534.2043 width + the layout group's 36 spacing), but
   * the values are listed rather than computed so they stay diffable.
   */
  filterDropdowns: {
    size: { x: 534.2043, y: 56.3507 },
    posY: -28.1754,
    items: [
      { key: 'department', label: 'Department', posX: 267.1021 },
      { key: 'classification', label: 'Classification', posX: 837.3064 },
      { key: 'artist', label: 'Artist/Maker', posX: 1407.5107 },
      { key: 'culture', label: 'Place of origin', posX: 1977.715 },
      { key: 'date', label: 'Date', posX: 2547.9192 },
    ],
    label: { fontSizePx: 30, colour: '#000000' } satisfies TextSpec,
    /** TMP margin (18, 0, 0, 0) on each dropdown label, as in portrait. */
    labelMarginPx: { left: 18, top: 0, right: 0, bottom: 0 },
    arrowSprite: '/assets/common/dropdown-arrow.png',
    arrowSize: 30,
    arrowInset: 15,
    /** Popup metrics are identical in both scenes. */
    popupHeight: DROPDOWN_POPUP.popupHeight,
    popupGap: DROPDOWN_POPUP.popupGap,
    popupRowHeight: DROPDOWN_POPUP.popupRowHeight,
    outlineColour: DROPDOWN_POPUP.outlineColour,
  },

  resultInfoBar: {
    rect: {
      kind: 'fractional',
      anchorMin: { x: 0.1248, y: 0.7635 },
      anchorMax: { x: 0.8578, y: 0.7902 },
    } satisfies LayoutRect,
    countRect: {
      kind: 'fractional',
      anchorMin: { x: 0, y: 0 },
      anchorMax: { x: 0.3831, y: 1 },
    } satisfies LayoutRect,
    count: { fontSizePx: 32, colour: 'var(--map-white)' } satisfies TextSpec,
    /** Full height here; portrait insets it to 0.2001-0.7999. */
    sortRect: {
      kind: 'fractional',
      anchorMin: { x: 0.7628, y: 0 },
      anchorMax: { x: 0.9689, y: 1 },
    } satisfies LayoutRect,
    sortLabelRect: {
      kind: 'point',
      anchor: { x: 0, y: 0.5 },
      pos: { x: -10, y: 0 },
      size: { x: 0, y: 0 },
      pivot: { x: 1, y: 0.5 },
    } satisfies LayoutRect,
    sortLabel: { fontSizePx: 24, colour: 'var(--map-white)', text: 'Sort By' } satisfies TextSpec,
    /**
     * GridViewButton — 45x45 here (60x60 in portrait), anchor (1,0.5),
     * pivot (1,0.5). Visual only, sprite GridView.png (pink tile). See the
     * portrait table for the rationale.
     */
    gridViewRect: {
      kind: 'point',
      anchor: { x: 1, y: 0.5 },
      pos: { x: 0, y: 0 },
      size: { x: 45, y: 45 },
      pivot: { x: 1, y: 0.5 },
    } satisfies LayoutRect,
    gridViewSprite: '/assets/browse/grid-view.svg',
  },

  cardArea: {
    /** Black panel behind the grid. */
    containerRect: {
      kind: 'fractional',
      anchorMin: { x: 0.1248, y: 0.1899 },
      anchorMax: { x: 0.8578, y: 0.7546 },
    } satisfies LayoutRect,
    /** Inset 75 px each side to leave room for the page arrows (portrait: 100). */
    scrollRect: { kind: 'stretch', size: { x: -150, y: 0 } } satisfies LayoutRect,
    /**
     * Edge-stretched, 870 px shorter than the panel, and nudged 65 px up. The
     * portrait table pre-resolved the same idiom to a point rect (581.4 px tall);
     * here it stays as the scene wrote it.
     */
    prevButtonRect: {
      kind: 'verticalBand',
      anchorX: 0,
      anchorMinY: 0,
      anchorMaxY: 1,
      pos: { x: 0, y: 65 },
      size: { x: 75, y: -870.0001 },
      pivot: { x: 0, y: 0.5 },
    } satisfies LayoutRect,
    nextButtonRect: {
      kind: 'verticalBand',
      anchorX: 1,
      anchorMinY: 0,
      anchorMaxY: 1,
      pos: { x: 0, y: 65 },
      size: { x: 75, y: -870 },
      pivot: { x: 1, y: 0.5 },
    } satisfies LayoutRect,
    arrowSprite: '/assets/browse/pagination-arrow.svg',
    arrowSize: 40,

    /** Grid maths — code, not scene, so identical in both builds. */
    targetCellSizePx: CARD_GRID.targetCellSizePx,
    minColumns: CARD_GRID.minColumns,
    gapPx: CARD_GRID.gapPx,
    paddingPx: CARD_GRID.paddingPx,
  },

  pagination: {
    rect: {
      kind: 'fractional',
      anchorMin: { x: 0.1349, y: 0.116 },
      anchorMax: { x: 0.8505, y: 0.1623 },
    } satisfies LayoutRect,
    info: { fontSizePx: 42, colour: 'var(--map-white)' } satisfies TextSpec,
    /** `HorizontalLayoutGroup` spacing; 50 in portrait. Recorded, not used. */
    barSpacingPx: 30,
  },

  /** Card internals — UNVERIFIED, shared with portrait. See the header note. */
  card: CARD_INTERNALS,
} as const;

/**
 * Browse & Discover geometry — portrait, 2160 × 3840.
 *
 * TRANSCRIBED VERBATIM from docs/ui/scene-portrait.md (lines 180-520).
 *
 * KNOWN GAP: the artwork CARD is instantiated from a prefab at runtime, and that
 * prefab is not in the repository — there is no `.prefab` file and `CardGrid` has
 * no children in the scene. So the card's INTERNAL geometry (title/artist/
 * accession sizes and positions) is NOT verified against Unity; the values below
 * are consistent with the rest of this screen but should be confirmed against a
 * Unity screenshot or the prefab. Everything else here is exact.
 *
 * The grid maths themselves ARE documented and exact: `targetCellSize = 320`,
 * minimum 2 columns, square cells (ui-spec §5).
 */

import type { LayoutRect } from './rect';
import type { TextSpec } from './portrait';

/** Body typeface on this screen is Conduit ITC **Regular**, not Bold. */
const REGULAR = 'var(--font-display)';

/**
 * Card-grid maths. NOT scene data: `CardGrid` has no `GridLayoutGroup` in either
 * scene, so `CollectionUIManager.SetupGridLayout` adds one at runtime and
 * `UpdateGridCellSize` sizes the cells. Both orientations therefore share these.
 *
 * The spacing and padding were wrong until ADR-022 (gap was 24 and the padding
 * was missing). From `SetupGridLayout`:
 *   `padding = RectOffset(16, 16, 16, 40)`, `spacing = (16, 16)`,
 * and from `UpdateGridCellSize`:
 *   `columns = max(2, floor((availableWidth + spacing.x) / (320 + spacing.x)))`
 * with `availableWidth = gridWidth − padding.left − padding.right`, which is
 * exactly what `repeat(auto-fill, minmax(320px, 1fr))` with a 16 px gap computes.
 */
export const CARD_GRID = {
  targetCellSizePx: 320,
  minColumns: 2,
  gapPx: 16,
  /** `RectOffset(left, right, top, bottom)`, so the bottom is the odd one out. */
  paddingPx: { left: 16, right: 16, top: 16, bottom: 40 },
} as const;

/** Dropdown popup metrics. Identical in both scenes. */
export const DROPDOWN_POPUP = {
  /** Full width, 400 px tall, 4 px below the control, 60 px rows. */
  popupHeight: 400,
  popupGap: 4,
  popupRowHeight: 60,
  outlineColour: '#CCCCCC',
} as const;

/**
 * Card internals — UNVERIFIED, see the header note. Sizes follow this screen's
 * established scale (30 for primary text, 24 for secondary). Shared by both
 * orientations rather than invented twice.
 */
export const CARD_INTERNALS = {
  titleFontSizePx: 30,
  metaFontSizePx: 24,
  titleColour: 'var(--map-white)',
  metaColour: 'rgb(255 255 255 / 0.7)',
  captionHeightPx: 132,
  fontFamily: REGULAR,
} as const;

export const BROWSE_PORTRAIT = {
  screen: {
    rect: { kind: 'stretch' } satisfies LayoutRect,
    background: '/assets/common/background-portrait.png',
  },

  appLogo: {
    rect: {
      kind: 'fractional',
      anchorMin: { x: 0.3969, y: 0.8821 },
      anchorMax: { x: 0.6031, y: 0.9494 },
    } satisfies LayoutRect,
    sprite: '/assets/gameplay/map-logo.svg',
  },

  /** `BackButton.png` at alpha 0.85 — note this screen uses Back, not Home. */
  backButton: {
    rect: {
      kind: 'point',
      anchor: { x: 0, y: 0.5 },
      pos: { x: 40, y: 60 },
      size: { x: 124, y: 124 },
      pivot: { x: 0, y: 0.5 },
    } satisfies LayoutRect,
    sprite: '/assets/gameplay/back-button.svg',
    opacity: 0.85,
  },

  searchBar: {
    rect: {
      kind: 'fractional',
      anchorMin: { x: 0.0918, y: 0.8391 },
      anchorMax: { x: 0.8958, y: 0.8573 },
    } satisfies LayoutRect,
    /** White field; 1 px #CCCCCC outline. */
    fieldRect: { kind: 'stretch' } satisfies LayoutRect,
    outlineColour: '#CCCCCC',
    /** Text Area is inset: pos (−20, 0), size (−80, 0). */
    textAreaRect: { kind: 'stretch', size: { x: -80, y: 0 } } satisfies LayoutRect,
    input: { fontSizePx: 34, colour: '#262626' } satisfies TextSpec,
    placeholder: {
      fontSizePx: 34,
      colour: 'rgb(128 128 128 / 0.7)',
      text: 'Search...',
    } satisfies TextSpec,
    /** Only visible when the field has text (`UpdateSearchControls`). */
    clearButtonRect: {
      kind: 'point',
      anchor: { x: 1, y: 0.5 },
      pos: { x: -15, y: 0 },
      size: { x: 50, y: 50 },
      pivot: { x: 1, y: 0.5 },
    } satisfies LayoutRect,
    clearSprite: '/assets/popup/icon-error.png',
    /** Sits OUTSIDE the field's right edge: pivot (0, 0.5) on anchor x = 1. */
    searchButtonRect: {
      kind: 'point',
      anchor: { x: 1, y: 0.5 },
      pos: { x: 0, y: 0 },
      size: { x: 70, y: 70 },
      pivot: { x: 0, y: 0.5 },
    } satisfies LayoutRect,
    searchSprite: '/assets/browse/search-button.svg',
  },

  filterBar: {
    rect: {
      kind: 'fractional',
      anchorMin: { x: 0.0918, y: 0.787 },
      anchorMax: { x: 0.9274, y: 0.8052 },
    } satisfies LayoutRect,
    titleRect: {
      kind: 'point',
      anchor: { x: 0, y: 1 },
      pos: { x: 0, y: 18.77 },
      size: { x: 300, y: 70 },
      pivot: { x: 0, y: 0 },
    } satisfies LayoutRect,
    title: { fontSizePx: 42, colour: 'var(--map-white)', text: 'Filter By' } satisfies TextSpec,
    clearFiltersRect: {
      kind: 'point',
      anchor: { x: 1, y: 1 },
      pos: { x: 0, y: 18.77 },
      size: { x: 300, y: 70 },
      pivot: { x: 1, y: 0 },
    } satisfies LayoutRect,
    clearFilters: {
      /**
       * Matched to `title` (42) at the client's request, 2026-07-31. The scene
       * serializes 24, which left the two ends of the same header row at
       * noticeably different weights.
       */
      fontSizePx: 42,
      colour: 'var(--map-white)',
      text: 'Clear Filters',
    } satisfies TextSpec,
  },

  /**
   * The five dropdowns share a size and y; only `pos.x` differs. Spacing is a
   * uniform 368.1656 px, but the values are listed rather than computed so they
   * stay diffable against the dump.
   */
  filterDropdowns: {
    size: { x: 332.1656, y: 70 },
    posY: -35,
    items: [
      { key: 'department', label: 'Department', posX: 166.0828 },
      { key: 'classification', label: 'Classification', posX: 534.2484 },
      { key: 'artist', label: 'Artist/Maker', posX: 902.4141 },
      { key: 'culture', label: 'Place of origin', posX: 1270.5796 },
      { key: 'date', label: 'Date', posX: 1638.7452 },
    ],
    label: { fontSizePx: 30, colour: '#000000' } satisfies TextSpec,
    /** TMP margin (18, 0, 0, 0) on each dropdown label. */
    labelMarginPx: { left: 18, top: 0, right: 0, bottom: 0 },
    arrowSprite: '/assets/common/dropdown-arrow.png',
    arrowSize: 30,
    arrowInset: 15,
    popupHeight: DROPDOWN_POPUP.popupHeight,
    popupGap: DROPDOWN_POPUP.popupGap,
    popupRowHeight: DROPDOWN_POPUP.popupRowHeight,
    outlineColour: DROPDOWN_POPUP.outlineColour,
  },

  resultInfoBar: {
    rect: {
      kind: 'fractional',
      anchorMin: { x: 0.0918, y: 0.7566 },
      anchorMax: { x: 0.9274, y: 0.7836 },
    } satisfies LayoutRect,
    countRect: {
      kind: 'fractional',
      anchorMin: { x: 0, y: 0 },
      anchorMax: { x: 0.3831, y: 1 },
    } satisfies LayoutRect,
    count: { fontSizePx: 32, colour: 'var(--map-white)' } satisfies TextSpec,
    sortRect: {
      kind: 'fractional',
      anchorMin: { x: 0.7705, y: 0.2001 },
      anchorMax: { x: 0.9473, y: 0.7999 },
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
     * GridViewButton — scene rect: anchor (1,0.5), pos (0,0), size 60x60,
     * pivot (1,0.5), sprite GridView.png tinted #FFFFFF (the sprite is the pink
     * tile itself). Rendered VISUAL ONLY: there is a single grid view, so it
     * does not switch anything. The pink pill sits at the right end of the bar.
     */
    gridViewRect: {
      kind: 'point',
      anchor: { x: 1, y: 0.5 },
      pos: { x: 0, y: 0 },
      size: { x: 60, y: 60 },
      pivot: { x: 1, y: 0.5 },
    } satisfies LayoutRect,
    gridViewSprite: '/assets/browse/grid-view.svg',
    /**
     * `PerPageDD` at (0.535, 0.2001)-(0.6823, 0.7999) is active in the scene but
     * its option list is neither in the scene nor in the docs, so it is NOT
     * ported rather than guessed. `limit` stays at the documented 40.
     */
  },

  cardArea: {
    /** Black panel behind the grid. */
    containerRect: {
      kind: 'fractional',
      anchorMin: { x: 0.0918, y: 0.0841 },
      anchorMax: { x: 0.9274, y: 0.7566 },
    } satisfies LayoutRect,
    /** Inset 100 px each side to leave room for the page arrows. */
    scrollRect: { kind: 'stretch', size: { x: -200, y: 0 } } satisfies LayoutRect,
    prevButtonRect: {
      kind: 'point',
      anchor: { x: 0, y: 0.5 },
      pos: { x: 0, y: 275.5 },
      size: { x: 100, y: 581.4 },
      pivot: { x: 0, y: 0.5 },
    } satisfies LayoutRect,
    nextButtonRect: {
      kind: 'point',
      anchor: { x: 1, y: 0.5 },
      pos: { x: 0, y: 275.5 },
      size: { x: 100, y: 581.4 },
      pivot: { x: 1, y: 0.5 },
    } satisfies LayoutRect,
    arrowSprite: '/assets/browse/pagination-arrow.svg',
    arrowSize: 60,

    /** Grid maths — `UpdateGridCellSize`, ui-spec §5. See `CARD_GRID`. */
    targetCellSizePx: CARD_GRID.targetCellSizePx,
    minColumns: CARD_GRID.minColumns,
    gapPx: CARD_GRID.gapPx,
    paddingPx: CARD_GRID.paddingPx,
  },

  pagination: {
    rect: {
      kind: 'fractional',
      anchorMin: { x: 0.1163, y: 0.0446 },
      anchorMax: { x: 0.9018, y: 0.0706 },
    } satisfies LayoutRect,
    info: { fontSizePx: 42, colour: 'var(--map-white)' } satisfies TextSpec,
    /** `HorizontalLayoutGroup` spacing; 30 in landscape. Recorded, not used. */
    barSpacingPx: 50,
  },

  /** Card internals — UNVERIFIED, see the header note. */
  card: CARD_INTERNALS,
} as const;

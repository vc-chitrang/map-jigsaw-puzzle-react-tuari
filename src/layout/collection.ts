import type { Orientation } from '../game/types';
import type { LayoutRect } from './rect';
import type { TextSpec } from './portrait';
import { IMAGE_SELECT_PORTRAIT } from './crop';
import { IMAGE_SELECT_LANDSCAPE } from './crop-landscape';

/**
 * "Select The Collection" geometry.
 *
 * **NO UNITY SCENE EXISTS FOR THIS SCREEN.** It was added by the client on
 * 2026-08-04 with a 1920x1080 reference image, so unlike every other table in
 * `src/layout/` these numbers are not transcribed from scene YAML — they are read
 * off that reference. Landscape is the authored orientation; portrait is a
 * derivation the client explicitly delegated ("take your best call").
 *
 * The reference is 1920x1080 and the landscape canvas is 3840x2160 — exactly 2x —
 * so every measurement below is the reference-image value doubled.
 *
 * **The header chrome is REUSED, not taken from the reference** (client, 2026-08-04:
 * "make sure the design is match with existing app design"). Background, MAP logo
 * and back button come straight from `IMAGE_SELECT_*`, the screen this one sits next
 * to in the flow, so the header does not move as the visitor navigates.
 *
 * The reference image draws the logo top-CENTRE and large with a ~228 px back
 * button. That was implemented and then reverted on the instruction above — so in
 * landscape the logo stays top-RIGHT at ImageSelect's size and the button stays
 * 72 px. Only the grid, title and background come from the reference.
 */

export interface CollectionGrid {
  /** Grid container, sized so `columns x rows` tiles plus gaps fit exactly. */
  readonly rect: LayoutRect;
  readonly columns: number;
  readonly rows: number;
  readonly gapXPx: number;
  readonly gapYPx: number;
  /** Corner radius on each tile. */
  readonly radiusPx: number;
}

export interface CollectionLayout {
  readonly screen: { readonly rect: LayoutRect; readonly background: string };
  readonly appLogo: { readonly rect: LayoutRect; readonly sprite: string };
  readonly backButton: { readonly rect: LayoutRect; readonly sprite: string };
  /** Scrolling collage behind everything. */
  readonly banner: {
    readonly sprite: string;
    /** One full tile pass. Tuned per orientation so the PERCEIVED speed matches. */
    readonly scrollDurationMs: number;
    /** Black scrim over the collage. Client raised 0.3 -> 0.5 -> 0.85 on review. */
    readonly scrimColour: string;
  };
  readonly title: { readonly rect: LayoutRect; readonly text: TextSpec };
  readonly grid: CollectionGrid;
  readonly tileLabel: TextSpec;
}

/**
 * Landscape — the authored design.
 *
 * Reference (1920x1080) -> doubled: tiles 363x210 -> 726x420, gaps 48/47 -> 96/94.
 * Grid width 3*726 + 2*96 = 2370, height 2*420 + 94 = 934. Centred horizontally,
 * left 735.
 *
 * **Vertically the title and grid are centred as ONE BLOCK**, which diverges from
 * the reference (it sits the grid below centre, at y 956). Client asked for centred
 * on 2026-08-04. Block = title 140 + gap 120 + grid 934 = 1194, so it starts at
 * (2160 - 1194) / 2 = 483: title 483..623, grid 743..1677. That clears the
 * top-right logo, which ends at y 322.
 */
const LANDSCAPE: CollectionLayout = {
  screen: {
    rect: IMAGE_SELECT_LANDSCAPE.screen.rect,
    background: IMAGE_SELECT_LANDSCAPE.screen.background,
  },
  appLogo: IMAGE_SELECT_LANDSCAPE.appLogo,
  backButton: IMAGE_SELECT_LANDSCAPE.backButton,
  banner: {
    sprite: '/assets/collection/collage-banner.jpg',
    /**
     * The tile is drawn full-width and repeated vertically, so in landscape one
     * pass is 3840 * (1920/1080) = 6827 ref px. 90 s gives ~76 ref px/s.
     */
    scrollDurationMs: 90_000,
    scrimColour: 'rgb(0 0 0 / 0.85)',
  },
  title: {
    rect: {
      kind: 'horizontalBand',
      anchorY: 1,
      anchorMinX: 0,
      anchorMaxX: 1,
      // Top of the centred block. `pos.y` is negated into `top` by `rectStyle`.
      pos: { x: 0, y: -483 },
      size: { x: 0, y: 140 },
      pivot: { x: 0.5, y: 1 },
    } satisfies LayoutRect,
    text: {
      fontSizePx: 104,
      colour: 'var(--colour-artwork-title)',
      text: 'Select The Collection',
    } satisfies TextSpec,
  },
  grid: {
    rect: {
      kind: 'point',
      anchor: { x: 0, y: 1 },
      pos: { x: 735, y: -743 },
      size: { x: 2370, y: 934 },
      pivot: { x: 0, y: 1 },
    } satisfies LayoutRect,
    columns: 3,
    rows: 2,
    gapXPx: 96,
    gapYPx: 94,
    radiusPx: 12,
  },
  tileLabel: { fontSizePx: 56, colour: 'var(--map-white)' } satisfies TextSpec,
};

/**
 * Portrait — derived, not authored.
 *
 * **Fixed 600x370 tile size, 3 columns x 2 rows, WITH a real column gap
 * (2026-08-14 second revision).** The previous revision centred the grid
 * exactly (equal margins) and found that a real fixed 600px x3 tile row only
 * leaves 360px total slack on a 2160px canvas — not enough room for both a
 * visible gap AND a symmetric, safely-clear-of-the-back-button margin at the
 * same time (0 gap was the only way to keep both a full centring AND a safe
 * margin). Client asked for a real gap between tiles and explicitly OK'd
 * shifting the block off dead-centre to make room — so this revision keeps
 * the internal grid still tile-by-tile evenly spaced (equal column gaps,
 * looks centred as a unit), but the block's LEFT margin is now bigger than
 * its RIGHT margin, shifted toward the side with nothing to clear:
 *
 *   gapX      = 48                              (a real, visible gap)
 *   gridWidth = 3*600 + 2*48 = 1896
 *   leftMargin  = 212   -> clearance from the back button (x 40..164) = 48px,
 *                          reusing the exact 48px figure this file has used
 *                          for back-button clearance since the very first
 *                          portrait revision — not a new number invented here
 *   rightMargin = 2160 - 212 - 1896 = 52         -> nothing sits there, so a
 *                                                    thinner margin is safe
 *
 * The back button occupies x 40..164 (anchor 0, pos 40, size 124); the grid's
 * left edge at x 212 clears it by the same 48px this file has always used.
 * The right side of the canvas has no button or chrome to protect, so a
 * smaller 52px margin there carries no overlap risk.
 *
 * Row gap is unaffected by any of this (rows are the unconstrained axis) and
 * keeps the 94px used throughout this file:
 *
 *   gridHeight = 2*370 + 94 = 834
 *
 * **The GRID's vertical centre stays aligned to the BACK BUTTON's vertical
 * centre** (unchanged from every prior revision — the button's `pos.y: 60`
 * offsets it off true screen-middle, landing its centre at ref y 1860).
 * Grid top = 1860 - 834/2 = 1443, bottom = 2277 — unchanged from the previous
 * revision, since only the horizontal numbers moved. Title sits above with
 * the same 150px gap: title bottom = 1443 - 150 = 1293, title top = 1293 -
 * 180 = 1113. Both clear of the top-centre logo (ends at y 453).
 */
const PORTRAIT: CollectionLayout = {
  screen: {
    rect: IMAGE_SELECT_PORTRAIT.screen.rect,
    background: IMAGE_SELECT_PORTRAIT.screen.background,
  },
  appLogo: IMAGE_SELECT_PORTRAIT.appLogo,
  backButton: IMAGE_SELECT_PORTRAIT.backButton,
  banner: {
    sprite: '/assets/collection/collage-banner.jpg',
    /**
     * Portrait is 2160 wide, so one pass is 2160 * (1920/1080) = 3840 ref px —
     * exactly one screen height. 50 s gives ~77 ref px/s, matching landscape.
     */
    scrollDurationMs: 50_000,
    scrimColour: 'rgb(0 0 0 / 0.85)',
  },
  title: {
    rect: {
      kind: 'horizontalBand',
      anchorY: 1,
      anchorMinX: 0,
      anchorMaxX: 1,
      pos: { x: 0, y: -1113 },
      size: { x: 0, y: 180 },
      pivot: { x: 0.5, y: 1 },
    } satisfies LayoutRect,
    text: {
      fontSizePx: 128,
      colour: 'var(--colour-artwork-title)',
      text: 'Select The Collection',
    } satisfies TextSpec,
  },
  grid: {
    rect: {
      kind: 'point',
      anchor: { x: 0, y: 1 },
      pos: { x: 212, y: -1443 },
      size: { x: 1896, y: 834 },
      pivot: { x: 0, y: 1 },
    } satisfies LayoutRect,
    columns: 3,
    rows: 2,
    gapXPx: 48,
    gapYPx: 94,
    radiusPx: 16,
  },
  /** Tiles are wider now (600 vs 520), so this comes back up from 48. The
   *  longest label line ("Textiles, Craft &", 17 chars) still fits inside the
   *  600 px column with room to spare: at 52px, ~0.55em/char is ~486px against
   *  a 552px usable width (600 minus the tile's 24px horizontal padding). */
  tileLabel: { fontSizePx: 52, colour: 'var(--map-white)' } satisfies TextSpec,
};

export const COLLECTION_LAYOUT: Record<Orientation, CollectionLayout> = {
  portrait: PORTRAIT,
  landscape: LANDSCAPE,
};

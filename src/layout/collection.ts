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
 * Two columns x three rows: six tiles across a 2160-wide canvas would leave each
 * about 660 px wide with the reference's proportions, too small to read at arm's
 * length on a 4K panel. Tiles keep the reference ASPECT (726:420 = 1.729) at
 * 820x474, so the artwork crops identically to landscape.
 *
 * Grid width 2*820 + 96 = 1736, centred -> left 212. Height 3*474 + 2*94 = 1610.
 *
 * **The width is capped by the BACK BUTTON, not by taste.** Portrait's button
 * occupies x 40..164 (anchor 0, pos 40, size 124), and a full-bleed 1896-wide grid
 * centres at left 132 — so the first tile sat on top of it and swallowed taps meant
 * for Back. 1736 leaves a 48 px gap. Widening the tiles again must move the button
 * or it will re-break.
 *
 * Title and grid are centred as one block, as in landscape: block = title 180 +
 * gap 150 + grid 1610 = 1940, starting at (3840 - 1940) / 2 = 950. Title 950..1130,
 * grid 1280..2890 — clear of the top-centre logo (ends at y 453) and of the back
 * button (vertical centre 1860, but only 164 px wide).
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
      pos: { x: 0, y: -950 },
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
      pos: { x: 212, y: -1280 },
      size: { x: 1736, y: 1610 },
      pivot: { x: 0, y: 1 },
    } satisfies LayoutRect,
    columns: 2,
    rows: 3,
    gapXPx: 96,
    gapYPx: 94,
    radiusPx: 16,
  },
  tileLabel: { fontSizePx: 68, colour: 'var(--map-white)' } satisfies TextSpec,
};

export const COLLECTION_LAYOUT: Record<Orientation, CollectionLayout> = {
  portrait: PORTRAIT,
  landscape: LANDSCAPE,
};

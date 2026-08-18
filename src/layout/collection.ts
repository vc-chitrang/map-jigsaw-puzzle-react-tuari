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
 * **Three columns x two rows (2026-08-10 revision).** Matches the reference
 * design's actual reading order — `departments.ts` already lists the six tiles
 * "three across, two down" — reversing the original 2x3 portrait derivation.
 *
 * Grid width is kept at the SAME 1736 footprint as the old 2x3 layout (that
 * width was itself `2160 - 2*212`, i.e. centred with a 212 px margin each side)
 * and re-split into three columns instead of two:
 *
 *   tileW = (1736 - 2*88) / 3 = 520      (88 px column gap)
 *   tileH = round(520 * 420/726) = 301   (keeps the 726:420 reference aspect)
 *   grid height = 2*301 + 94 = 696       (94 px row gap, unchanged from 2x3)
 *
 * **The left margin is still capped by the BACK BUTTON, not by taste** (ADR
 * context above the old 2x3 table): the button occupies x 40..164, so anything
 * starting left of 212 re-swallows its taps. Reusing 1736 keeps that same
 * 48 px clearance without re-deriving it.
 *
 * **The GRID's vertical centre is aligned to the BACK BUTTON's vertical
 * centre** (client, 2026-08-10, marked up on a screenshot with a guide line
 * through the button). Not the same as the raw screen centre: the button's
 * `pos.y: 60` offsets it off true-middle, landing its centre at ref y 1860
 * (measured live: device rect y 899..961 at 1080x1920 scale 0.5 -> ref
 * 1798..1922, centre 1860), 60 px above 1920.
 *
 * Grid top = 1860 - 696/2 = 1512, bottom = 2208. Title sits above with the
 * same 150 px gap: title bottom = 1512 - 150 = 1362, title top = 1362 - 180 =
 * 1182. Both clear of the top-centre logo (ends at y 453) and of the back
 * button itself (x 40..164, entirely left of the grid's x 212..1948, so its
 * y range never intersects the grid's x range).
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
      pos: { x: 0, y: -1182 },
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
      pos: { x: 212, y: -1512 },
      size: { x: 1736, y: 696 },
      pivot: { x: 0, y: 1 },
    } satisfies LayoutRect,
    columns: 3,
    rows: 2,
    gapXPx: 88,
    gapYPx: 94,
    radiusPx: 16,
  },
  /** Smaller than the old 2x3 tile's 68: these tiles are ~40% shorter, and the
   *  longest label line ("Textiles, Craft &") still fits inside the 520 px
   *  column width with room to spare at this size. */
  tileLabel: { fontSizePx: 48, colour: 'var(--map-white)' } satisfies TextSpec,
};

export const COLLECTION_LAYOUT: Record<Orientation, CollectionLayout> = {
  portrait: PORTRAIT,
  landscape: LANDSCAPE,
};

/**
 * Portrait geometry table — 2160 × 3840.
 *
 * TRANSCRIBED VERBATIM from `docs/ui/scene-portrait.md`, which is generated from
 * the Unity scene by `docs/tools/extract_ui.py`. Do not "tidy" these numbers and
 * do not compute them in a component: after a scene change the dump is
 * regenerated and this file is diffed against it.
 *
 * Font sizes are reference px and live here too, because they are part of the
 * geometry — they scale with the canvas, never with `rem`.
 */

import type { LayoutRect } from './rect';

/** TMP `m_margin`, which is `(left, top, right, bottom)`. */
export interface TextMargin {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface TextSpec {
  readonly fontSizePx: number;
  /** CSS custom property or literal colour. */
  readonly colour: string;
  /**
   * Authored string, verbatim. Some labels are authored lowercase and carry TMP's
   * UpperCase style — set `uppercase` on those rather than assuming (ADR-022).
   */
  readonly text?: string;
  /** TMP `m_fontStyle & 16`. See `TextLike.uppercase`. */
  readonly uppercase?: boolean;
  /**
   * TMP `m_margin`, in reference px. Text is centred inside the rect MINUS these
   * margins, so a left margin shifts the label right — which is how the footer
   * labels clear their icons. Omitting them overlaps label and icon.
   */
  readonly marginPx?: TextMargin;
}

export const PUZZLE_PORTRAIT = {
  /** Full-screen background image. */
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
    sprite: '/assets/gameplay/map-logo.png',
  },

  /** Home button, top-left. Idiom B worked example in pixel-perfect §3.3. */
  backButton: {
    rect: {
      kind: 'point',
      anchor: { x: 0, y: 0.5 },
      pos: { x: 40, y: 60 },
      size: { x: 124, y: 124 },
      pivot: { x: 0, y: 0.5 },
    } satisfies LayoutRect,
    sprite: '/assets/gameplay/home-button.svg',
  },

  /** "TAP THE TILES TO SOLVE THE PUZZLE" — zero-sized text at a point anchor. */
  caption: {
    rect: {
      kind: 'point',
      anchor: { x: 0.5, y: 0.5 },
      pos: { x: 0, y: -377 },
      size: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    } satisfies LayoutRect,
    text: {
      fontSizePx: 83,
      colour: 'var(--colour-caption)',
      text: 'TAP THE TILES TO SOLVE THE PUZZLE',
      uppercase: true,
    } satisfies TextSpec,
  },

  /** Shown in attract mode; mutually exclusive with the timer. */
  startButton: {
    rect: {
      kind: 'fractional',
      anchorMin: { x: 0.233, y: 0.3202 },
      anchorMax: { x: 0.4766, y: 0.3707 },
    } satisfies LayoutRect,
    sprite: '/assets/gameplay/start-button.svg',
    pressedSprite: '/assets/gameplay/start-button-pressed.svg',
    label: {
      fontSizePx: 112,
      colour: 'var(--map-white)',
      text: 'START',
      uppercase: true,
      marginPx: { left: 16, top: 0, right: 0, bottom: 20 },
    } satisfies TextSpec,
  },

  /** Shown during gameplay; mutually exclusive with START. */
  timer: {
    rect: {
      kind: 'point',
      anchor: { x: 0.5, y: 0.5 },
      pos: { x: -313.65, y: -593.5649 },
      size: { x: 526, y: 194 },
      pivot: { x: 0.5, y: 0.5 },
    } satisfies LayoutRect,
    sprite: '/assets/gameplay/timer-background.svg',
    label: { fontSizePx: 100, colour: 'var(--map-white)' } satisfies TextSpec, // margin 0
  },

  highScore: {
    rect: {
      kind: 'fractional',
      anchorMin: { x: 0.5669, y: 0.3262 },
      anchorMax: { x: 0.7175, y: 0.3565 },
    } satisfies LayoutRect,
    sprite: '/assets/common/circle-9sliced.png',
    /** Uniform 255 px 9-slice border (asset-manifest §3). */
    sliceBorderPx: 255,
    tint: 'var(--colour-highscore-badge)',
    /** "HIGH SCORE" sits ABOVE the badge: pivot (0.5,0) on the top edge. */
    titleRect: {
      kind: 'horizontalBand',
      anchorY: 1,
      anchorMinX: 0,
      anchorMaxX: 1,
      pos: { x: 0, y: 4.4 },
      size: { x: 0, y: 40 },
      pivot: { x: 0.5, y: 0 },
    } satisfies LayoutRect,
    title: {
      fontSizePx: 48,
      colour: 'var(--map-white)',
      text: 'HIGH SCORE',
    } satisfies TextSpec,
    valueRect: { kind: 'stretch' } satisfies LayoutRect,
    value: {
      fontSizePx: 82,
      colour: 'var(--map-white)',
      marginPx: { left: 10, top: 10, right: 10, bottom: 10 },
    } satisfies TextSpec,
  },

  footerButtons: {
    reset: {
      rect: {
        kind: 'fractional',
        anchorMin: { x: 0.1311, y: 0.2476 },
        anchorMax: { x: 0.3302, y: 0.294 },
      } satisfies LayoutRect,
      sprite: '/assets/gameplay/reset-button.svg',
      pressedSprite: '/assets/gameplay/reset-button-pressed.svg',
      label: {
        fontSizePx: 68,
        colour: 'var(--map-white)',
        text: 'RESET',
        uppercase: true,
        marginPx: { left: 90, top: 8, right: 0, bottom: 16 },
      } satisfies TextSpec,
      icon: {
        sprite: '/assets/gameplay/icon-reset.svg',
        rect: {
          kind: 'fractional',
          anchorMin: { x: 0.2272, y: 0.336 },
          anchorMax: { x: 0.3784, y: 0.7011 },
        } satisfies LayoutRect,
      },
    },

    preview: {
      rect: {
        kind: 'fractional',
        anchorMin: { x: 0.4005, y: 0.2476 },
        anchorMax: { x: 0.5995, y: 0.294 },
      } satisfies LayoutRect,
      sprite: '/assets/gameplay/preview-button.svg',
      pressedSprite: '/assets/gameplay/preview-button-pressed.svg',
      // Authored lowercase in the scene; uppercased by CSS (ui-spec §4.2).
      label: {
        fontSizePx: 68,
        colour: 'var(--map-white)',
        text: 'preview',
        uppercase: true,
        marginPx: { left: 122, top: 0, right: 0, bottom: 16 },
      } satisfies TextSpec,
      icon: {
        sprite: '/assets/gameplay/icon-preview.svg',
        rect: {
          kind: 'fractional',
          anchorMin: { x: 0.146, y: 0.3367 },
          anchorMax: { x: 0.3088, y: 0.73 },
        } satisfies LayoutRect,
      },
    },

    newImage: {
      rect: {
        kind: 'fractional',
        anchorMin: { x: 0.6708, y: 0.2476 },
        anchorMax: { x: 0.8699, y: 0.294 },
      } satisfies LayoutRect,
      sprite: '/assets/gameplay/new-image-button.svg',
      pressedSprite: '/assets/gameplay/new-image-button-pressed.svg',
      label: {
        fontSizePx: 68,
        colour: 'var(--map-white)',
        text: 'new image',
        uppercase: true,
        marginPx: { left: 110, top: 10, right: 6, bottom: 18 },
      } satisfies TextSpec,
      icon: {
        sprite: '/assets/gameplay/icon-new-image.svg',
        rect: {
          kind: 'fractional',
          anchorMin: { x: 0.0958, y: 0.336 },
          anchorMax: { x: 0.2586, y: 0.7292 },
        } satisfies LayoutRect,
      },
    },
  },

  preview: {
    /** Backdrop: #000000 at alpha 0.86. */
    panelRect: { kind: 'stretch' } satisfies LayoutRect,
    /** Full width, 1680 px shorter than the screen — 840 off top and bottom. */
    imageRect: { kind: 'stretch', size: { x: 0, y: -1680 } } satisfies LayoutRect,
  },

  /**
   * Artwork title. NOT in the scene — created at runtime by
   * `GameManager.EnsureArtworkTitleObject` inside `BoardPanel_Container`, which
   * mirrors the board rect. Floats 10 px above the board's top edge:
   * `pivot (0.5, 0)` on the top edge with `pos.y = 10`, height 100.
   */
  artworkTitle: {
    rect: {
      kind: 'horizontalBand',
      anchorY: 1,
      anchorMinX: 0,
      anchorMaxX: 1,
      pos: { x: 0, y: 10 },
      size: { x: 0, y: 100 },
      pivot: { x: 0.5, y: 0 },
    } satisfies LayoutRect,
    text: { fontSizePx: 62, colour: 'var(--colour-artwork-title)' } satisfies TextSpec,
  },
} as const;

export type PuzzleLayout = typeof PUZZLE_PORTRAIT;

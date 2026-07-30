/**
 * Puzzle screen geometry — LANDSCAPE, 3840 × 2160.
 *
 * TRANSCRIBED VERBATIM from docs/ui/scene-landscape.md lines 29-140, with TMP
 * margins and alignments read from the scene YAML directly.
 *
 * LANDSCAPE IS NOT PORTRAIT REARRANGED. Beyond positions, these differ:
 *
 *   | | portrait | landscape |
 *   |---|---|---|
 *   | back button        | 124² at pos (40, 60) | **72²** at pos (60, 0) |
 *   | app logo           | top centre           | **top right**, pivot (1,1) |
 *   | footer buttons     | absolute, fractional | **HorizontalLayoutGroup** |
 *   | START label        | "START" at 112       | "start" at **82** |
 *   | footer labels      | 68                   | **44** |
 *   | timer              | 526×194, text 100    | **315×121, text 82** |
 *   | high-score badge   | Circle_9Sliced, #67797F | **flat #67787F**, 224×80 |
 *   | high-score value   | 82                   | **52** |
 *   | caption            | 83, #E7B639          | **68, #DCB63C** |
 *   | footer icons       | fractional anchors   | **45² at a fixed left offset** |
 *
 * THE FOOTER IS A FLEX ROW, not absolute positions. `ControlButtons_00` carries a
 * `HorizontalLayoutGroup` (spacing 50, childAlignment 7 = LowerCenter,
 * childForceExpandWidth/Height = 1, childControlWidth/Height = 0) plus a
 * `ContentSizeFitter`. Every child sits at `pos (0,0)` in the scene because the
 * layout group positions them at runtime — reading the dump alone would put all
 * five buttons on top of each other.
 *
 * `extract_ui.py` does not report layout groups, which is why this had to be read
 * from the scene YAML. Same lesson as ADR-015 and ADR-017.
 */

import type { LayoutRect } from './rect';
import type { TextSpec } from './portrait';

export const PUZZLE_LANDSCAPE = {
  screen: {
    rect: { kind: 'stretch' } satisfies LayoutRect,
    background: '/assets/common/background-landscape.png',
  },

  /** Top RIGHT in landscape, unlike portrait's top centre. */
  appLogo: {
    rect: {
      kind: 'fractional',
      anchorMin: { x: 0.868, y: 0.8511 },
      anchorMax: { x: 0.9337, y: 0.926 },
    } satisfies LayoutRect,
    sprite: '/assets/gameplay/map-logo.svg',
  },

  /** 72² and vertically centred, versus portrait's 124² offset upward. */
  backButton: {
    rect: {
      kind: 'point',
      anchor: { x: 0, y: 0.5 },
      pos: { x: 60, y: 0 },
      size: { x: 72, y: 72 },
      pivot: { x: 0, y: 0.5 },
    } satisfies LayoutRect,
    sprite: '/assets/gameplay/home-button.svg',
  },

  /** A 196 px band whose bottom edge sits 40 px above the screen bottom. */
  footerRect: {
    kind: 'horizontalBand',
    anchorY: 0,
    anchorMinX: 0,
    anchorMaxX: 1,
    pos: { x: 0, y: 40 },
    size: { x: 0, y: 196 },
    pivot: { x: 0.5, y: 0 },
  } satisfies LayoutRect,

  /** Sits ABOVE the footer band — note anchorY values greater than 1. */
  caption: {
    rect: {
      kind: 'fractional',
      anchorMin: { x: 0, y: 0.9895 },
      anchorMax: { x: 1, y: 1.8145 },
    } satisfies LayoutRect,
    text: {
      fontSizePx: 68,
      // Unity has #DCB63C here and #E7B639 in portrait; both resolve to the brand
      // amber token (ADR-013).
      colour: 'var(--colour-caption)',
      text: 'TAP THE TILES TO SOLVE THE PUZZLE',
      uppercase: true,
    } satisfies TextSpec,
  },

  /**
   * The flex row. `justify-content: space-evenly` approximates
   * `childForceExpandWidth` with `childControlWidth = 0`: Unity grows each child's
   * SLOT by an equal share of the surplus and centres the child in it, which for
   * this row is ~20 px per child. Verify against a capture before trusting it to
   * the pixel.
   */
  controls: {
    rect: {
      kind: 'fractional',
      anchorMin: { x: 0.2807, y: 0.1913 },
      anchorMax: { x: 0.7193, y: 0.8087 },
    } satisfies LayoutRect,
    gapPx: 50,
  },

  /** Shown during gameplay; mutually exclusive with START. */
  timer: {
    size: { x: 315, y: 121 },
    sprite: '/assets/gameplay/timer-background.svg',
    label: {
      fontSizePx: 82,
      colour: 'var(--map-white)',
      marginPx: { left: 10, top: 10, right: 10, bottom: 10 },
    } satisfies TextSpec,
  },

  startButton: {
    size: { x: 290, y: 121 },
    sprite: '/assets/gameplay/start-button.svg',
    pressedSprite: '/assets/gameplay/start-button-pressed.svg',
    // Authored lowercase and uppercased by CSS, as in portrait.
    label: {
      fontSizePx: 82,
      colour: 'var(--map-white)',
      text: 'start',
      uppercase: true,
      marginPx: { left: 10, top: 0, right: 0, bottom: 12 },
    } satisfies TextSpec,
  },

  highScore: {
    size: { x: 224, y: 80 },
    /** Flat fill, NOT the 9-sliced sprite portrait uses. */
    background: '#67787F',
    titleRect: {
      kind: 'horizontalBand',
      anchorY: 1,
      anchorMinX: 0,
      anchorMaxX: 1,
      pos: { x: 0, y: 0 },
      size: { x: 0, y: 50 },
      pivot: { x: 0.5, y: 0 },
    } satisfies LayoutRect,
    title: {
      fontSizePx: 36,
      colour: 'var(--map-white)',
      text: 'HIGH SCORE',
      marginPx: { left: 0, top: 0, right: 0, bottom: 4 },
    } satisfies TextSpec,
    valueRect: { kind: 'stretch' } satisfies LayoutRect,
    value: {
      fontSizePx: 52,
      colour: 'var(--map-white)',
      marginPx: { left: 10, top: 10, right: 10, bottom: 10 },
    } satisfies TextSpec,
  },

  /**
   * Footer buttons. Icons are 45² at a fixed left offset with `pivot (0, 0.5)`,
   * unlike portrait's fractional anchors, and each label carries a left margin
   * that clears its own icon.
   */
  footerButtons: {
    reset: {
      size: { x: 290, y: 121 },
      sprite: '/assets/gameplay/reset-button.svg',
      pressedSprite: '/assets/gameplay/reset-button-pressed.svg',
      label: {
        fontSizePx: 44,
        colour: 'var(--map-white)',
        text: 'reset',
        uppercase: true,
        marginPx: { left: 48, top: 0, right: 0, bottom: 12 },
      } satisfies TextSpec,
      icon: {
        sprite: '/assets/gameplay/icon-reset.svg',
        rect: {
          kind: 'point',
          anchor: { x: 0, y: 0.5 },
          pos: { x: 48, y: 6 },
          size: { x: 45, y: 45 },
          pivot: { x: 0, y: 0.5 },
        } satisfies LayoutRect,
      },
    },

    preview: {
      size: { x: 290, y: 121 },
      sprite: '/assets/gameplay/preview-button.svg',
      pressedSprite: '/assets/gameplay/preview-button-pressed.svg',
      label: {
        fontSizePx: 44,
        colour: 'var(--map-white)',
        text: 'preview',
        uppercase: true,
        marginPx: { left: 72, top: 0, right: 0, bottom: 12 },
      } satisfies TextSpec,
      icon: {
        sprite: '/assets/gameplay/icon-preview.svg',
        rect: {
          kind: 'point',
          anchor: { x: 0, y: 0.5 },
          pos: { x: 32, y: 6 },
          size: { x: 45, y: 45 },
          pivot: { x: 0, y: 0.5 },
        } satisfies LayoutRect,
      },
    },

    newImage: {
      size: { x: 290, y: 121 },
      sprite: '/assets/gameplay/new-image-button.svg',
      pressedSprite: '/assets/gameplay/new-image-button-pressed.svg',
      label: {
        fontSizePx: 44,
        colour: 'var(--map-white)',
        text: 'new image',
        uppercase: true,
        marginPx: { left: 72, top: 0, right: 0, bottom: 12 },
      } satisfies TextSpec,
      icon: {
        sprite: '/assets/gameplay/icon-new-image.svg',
        rect: {
          kind: 'point',
          anchor: { x: 0, y: 0.5 },
          pos: { x: 24, y: 6 },
          size: { x: 45, y: 45 },
          pivot: { x: 0, y: 0.5 },
        } satisfies LayoutRect,
      },
    },
  },

  preview: {
    panelRect: { kind: 'stretch' } satisfies LayoutRect,
    /** Landscape insets the WIDTH by 1680 (portrait insets the height). */
    imageRect: { kind: 'stretch', size: { x: -1680, y: 0 } } satisfies LayoutRect,
  },

  /** Runtime-created, same as portrait: 10 px above the board's top edge. */
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

  /**
   * `SideStrip` (anchored to the right edge, 151 px wide) is INACTIVE in the
   * scene, so it does not ship. Listed here only so nobody re-adds it from the
   * asset manifest.
   */
  sideStripShips: false,
} as const;

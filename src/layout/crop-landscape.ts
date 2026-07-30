/**
 * Crop and Image-Select geometry — LANDSCAPE, 3840 × 2160.
 *
 * TRANSCRIBED VERBATIM from docs/ui/scene-landscape.md (lines 141-204 for
 * ImageSelect, 549-604 for Crop), with TMP margins, alignments and font styles
 * read from the scene YAML directly — the dump does not carry them.
 *
 * TWO STRUCTURAL SURPRISES, both of the ADR-015/019 family:
 *
 * 1. **The description changes parent.** In portrait it hangs inside the panel
 *    (`BalckBG`) on ImageSelect and inside the stage (`CropAreaBackground`) on
 *    Crop. In landscape it is a child of `Container`, i.e. the SCREEN, on both.
 *    Same element, different coordinate space — so the table says which parent
 *    it belongs to and the component honours that (`descriptionParent`).
 * 2. **The two ImageSelect choices swap idiom.** Portrait stacks two 682² POINT
 *    rects either side of a divider; landscape places them side by side with
 *    FRACTIONAL anchors. `rectStyle` covers both, so this stays data.
 *
 * Everything else that differs, differs only by number:
 *
 *   |                        | portrait | landscape |
 *   |---|---|---|
 *   | back button            | 124² at (40, 60) | **72²** at (60, 0) |
 *   | app logo               | top centre | **top right** |
 *   | IS panel               | 0.0778-0.9258 / 0.1708-0.7904 | **0.1978-0.8017 / 0.1897-0.8799** |
 *   | IS description         | 52 px #DFDFDF, h 146 | **48 px #FFFFFF, h 92** |
 *   | IS captions            | 52 px #DFDFDF, h 50 | **30 / 32 px #FFFFFF, h 100** |
 *   | IS collection icon     | pos (0, 87) | **(0, 80)** |
 *   | IS divider             | 2 × 142 at (0, 68) | **1 × 78 at (0, −32)** |
 *   | crop stage             | 1520.64² (0.148-0.852) | **1468.8² (0.3088-0.6913)** |
 *   | crop description       | 50 px, above the stage | **48 px, 125.6 px below the screen top** |
 *   | crop grid initial size | 500 | **1000** |
 *   | rotate buttons         | 120² at x ±100, y −160 | **80² at ±80, y −110** |
 *   | crop START             | fractional, "START" 100 px | **point 315×121, "start" 82 px** |
 *
 * The crop handle values (`handleSizePx`, `handleColour`, `minSizeFraction`) are
 * NOT per-orientation: they are serialized on `CropGridResizer`, identically in
 * both scenes, and the scene overrides the C# initialisers (ADR-022).
 *
 * `SideStrip (1)` / `SideStrip (4)` and `[X]Disable` / `[X]DisableButtons` are
 * inactive in the scene, so the upload-from-mobile button, the zoom slider and
 * the reset button do not ship — same conclusion as ADR-017 for portrait.
 */

import type { LayoutRect } from './rect';
import type { TextSpec } from './portrait';
import { CROP_SHARED } from './crop';

export const IMAGE_SELECT_LANDSCAPE = {
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

  backButton: {
    rect: {
      kind: 'point',
      anchor: { x: 0, y: 0.5 },
      pos: { x: 60, y: 0 },
      size: { x: 72, y: 72 },
      pivot: { x: 0, y: 0.5 },
    } satisfies LayoutRect,
    sprite: '/assets/gameplay/back-button.svg',
  },

  /** Translucent panel holding both choices. #000000 at alpha 0.5098. */
  panelRect: {
    kind: 'fractional',
    anchorMin: { x: 0.1978, y: 0.1897 },
    anchorMax: { x: 0.8017, y: 0.8799 },
  } satisfies LayoutRect,
  panelBackground: 'rgb(0 0 0 / 0.5098)',

  /**
   * Child of `Container`, NOT of the panel — 98 px below the screen's top edge.
   * Portrait's equivalent hangs inside the panel.
   */
  descriptionParent: 'screen',
  descriptionRect: {
    kind: 'horizontalBand',
    anchorY: 1,
    anchorMinX: 0,
    anchorMaxX: 1,
    pos: { x: 0, y: -98 },
    size: { x: 0, y: 92 },
    pivot: { x: 0.5, y: 1 },
  } satisfies LayoutRect,
  description: {
    fontSizePx: 48,
    colour: 'var(--map-white)',
    text: 'Choose one of the following modes to add images to the puzzle',
  } satisfies TextSpec,

  /** LEFT half of the panel; portrait puts this above the divider instead. */
  collectionButton: {
    rect: {
      kind: 'fractional',
      anchorMin: { x: 0.0606, y: 0.2615 },
      anchorMax: { x: 0.3357, y: 0.6928 },
    } satisfies LayoutRect,
    background: '#212121',
    captionRect: {
      kind: 'horizontalBand',
      anchorY: 1,
      anchorMinX: 0,
      anchorMaxX: 1,
      pos: { x: 0, y: 150 },
      size: { x: 0, y: 100 },
      pivot: { x: 0.5, y: 1 },
    } satisfies LayoutRect,
    caption: {
      fontSizePx: 30,
      colour: 'var(--map-white)',
      text: 'Browse and select from MAP’s collection',
    } satisfies TextSpec,
    iconRect: {
      kind: 'point',
      anchor: { x: 0.5, y: 0.5 },
      pos: { x: 0, y: 80 },
      size: { x: 162, y: 162 },
      pivot: { x: 0.5, y: 0.5 },
    } satisfies LayoutRect,
    iconSprite: '/assets/select/gallery-add.svg',
    // Sized to a real centred box below the icon (the Unity ContentSizeFitter is
    // not in the dump, so it came through as size (0,0), which collapsed the
    // text and spilled it below the card — same fix as portrait).
    labelRect: {
      kind: 'point',
      anchor: { x: 0.5, y: 0.5 },
      pos: { x: 0, y: -120 },
      size: { x: 600, y: 170 },
      pivot: { x: 0.5, y: 0.5 },
    } satisfies LayoutRect,
    // Authored with an explicit newline, and at the same 52 px as portrait —
    // the only ImageSelect text size that does NOT change.
    label: {
      fontSizePx: 52,
      colour: '#E1E1E1',
      text: "Add from\nMAP's collection",
    } satisfies TextSpec,
  },

  /** RIGHT half of the panel. */
  qrPanel: {
    rect: {
      kind: 'fractional',
      anchorMin: { x: 0.6634, y: 0.2632 },
      anchorMax: { x: 0.9394, y: 0.6925 },
    } satisfies LayoutRect,
    /** 9-sliced white pill, uniform 255 px border. */
    sprite: '/assets/common/circle-9sliced.png',
    sliceBorderPx: 255,
    captionRect: {
      kind: 'horizontalBand',
      anchorY: 1,
      anchorMinX: 0,
      anchorMaxX: 1,
      pos: { x: 0, y: 150 },
      size: { x: 0, y: 100 },
      pivot: { x: 0.5, y: 1 },
    } satisfies LayoutRect,
    caption: {
      fontSizePx: 32,
      colour: 'var(--map-white)',
      text: 'Scan the QR code to upload your own image',
    } satisfies TextSpec,
    /** Stretched with a +100 px overhang on each axis (`sizeDelta = (100,100)`). */
    codeRect: { kind: 'stretch' } satisfies LayoutRect,
    codeSprite: '/assets/qr/qr-code.png',
  },

  /** Decorative divider. Thinner and shorter than portrait's, and BELOW centre. */
  dividerRect: {
    kind: 'point',
    anchor: { x: 0.5, y: 0.5 },
    pos: { x: 0, y: -32 },
    size: { x: 1, y: 78 },
    pivot: { x: 0.5, y: 0.5 },
  } satisfies LayoutRect,
  dividerSprite: '/assets/common/vertical-line.png',
} as const;

export const CROP_LANDSCAPE = {
  screen: {
    rect: { kind: 'stretch' } satisfies LayoutRect,
    background: '/assets/common/background-landscape.png',
  },

  appLogo: IMAGE_SELECT_LANDSCAPE.appLogo,
  backButton: IMAGE_SELECT_LANDSCAPE.backButton,

  /**
   * The crop stage. Square here too, and it happens to be exactly the board
   * size: (0.6913 − 0.3088) × 3840 = 1468.8 = (0.8863 − 0.2063) × 2160
   * = min(3840, 2160) × 0.68, the landscape board padding factor.
   */
  stageRect: {
    kind: 'fractional',
    anchorMin: { x: 0.3088, y: 0.2063 },
    anchorMax: { x: 0.6913, y: 0.8863 },
  } satisfies LayoutRect,
  stageBackground: '#000000',

  /**
   * Child of `Container`, NOT of the stage — portrait anchors this above the
   * stage with `anchorY > 1`, landscape hangs it from the screen's top edge.
   */
  descriptionParent: 'screen',
  descriptionRect: {
    kind: 'horizontalBand',
    anchorY: 1,
    anchorMinX: 0,
    anchorMaxX: 1,
    pos: { x: 0, y: -125.6006 },
    size: { x: 0, y: 38 },
    pivot: { x: 0.5, y: 1 },
  } satisfies LayoutRect,
  description: {
    fontSizePx: 48,
    colour: 'var(--map-white)',
    text: 'Select the part of painting for your Puzzle',
  } satisfies TextSpec,

  /** Initial guide overlay; twice portrait's, on a stage 52 px smaller. */
  gridSprite: '/assets/crop/crop-reference-frame.svg',
  gridInitialSize: 1000,

  /** Handles and the minimum size come from the component, not the scene layout. */
  handleSizePx: CROP_SHARED.handleSizePx,
  handleColour: CROP_SHARED.handleColour,
  minSizeFraction: CROP_SHARED.minSizeFraction,

  rotateButtons: {
    size: { x: 80, y: 80 },
    /** Below the stage: pivot (0.5,0) on anchor y = 0, pos.y = −110. */
    posY: -110,
    anticlockwisePosX: -80,
    clockwisePosX: 80,
    background: '#000000',
    sprite: '/assets/common/circle-9sliced.png',
    sliceBorderPx: 255,
    iconSprite: '/assets/common/icon-rotate.png',
    iconColour: '#F4A200',
    /** Icon inset 8 px each side (`sizeDelta = (−16,−16)`). */
    iconInsetPx: 8,
  },

  /**
   * A POINT rect 100 px above the screen bottom, not portrait's fractional band,
   * and the same 315 × 121 as the landscape timer. The label is authored
   * lowercase with `m_fontStyle = 16` (UpperCase), so CSS uppercases it — the
   * same arrangement as the landscape Puzzle footer.
   */
  startButton: {
    rect: {
      kind: 'point',
      anchor: { x: 0.5, y: 0 },
      pos: { x: 0, y: 100 },
      size: { x: 315, y: 121 },
      pivot: { x: 0.5, y: 0 },
    } satisfies LayoutRect,
    sprite: '/assets/gameplay/start-button.svg',
    pressedSprite: '/assets/gameplay/start-button-pressed.svg',
    label: {
      fontSizePx: 82,
      colour: 'var(--map-white)',
      text: 'start',
      uppercase: true,
      marginPx: { left: 10, top: 0, right: 0, bottom: 10 },
    } satisfies TextSpec,
  },
} as const;

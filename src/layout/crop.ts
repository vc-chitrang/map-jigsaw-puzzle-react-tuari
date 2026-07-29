/**
 * Crop and Image-Select geometry — portrait, 2160 × 3840.
 *
 * TRANSCRIBED VERBATIM from docs/ui/scene-portrait.md (lines 132-180 and 521-602).
 *
 * IMPORTANT — the shipping crop UX is NOT what docs/game-logic.md §10 describes.
 * That section says "pan / pinch-zoom via PinchableScrollRect + a zoom slider".
 * In the scene:
 *
 *   * `Crop_Image_Screen` carries `ImageCropper`, `ImageZoomController`,
 *     `CropGridResizer` and `CropScreenController` — there is no
 *     `PinchableScrollRect`, so the image never pans or zooms.
 *   * `ResetZoomButton` and `ZoomSlider` sit under `[X]DisableButtons`, which is
 *     **inactive** — they do not ship.
 *
 * What actually ships (`CropGridResizer`): the image is displayed fitted, and a
 * **square** grid overlay is resized by four corner handles and moved by dragging
 * its body, clamped inside the visible image. See ADR-017.
 */

import type { LayoutRect } from './rect';
import type { TextSpec } from './portrait';

export const IMAGE_SELECT_PORTRAIT = {
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

  backButton: {
    rect: {
      kind: 'point',
      anchor: { x: 0, y: 0.5 },
      pos: { x: 40, y: 60 },
      size: { x: 124, y: 124 },
      pivot: { x: 0, y: 0.5 },
    } satisfies LayoutRect,
    sprite: '/assets/gameplay/back-button.png',
  },

  /** Translucent panel holding both choices. #000000 at alpha 0.5098. */
  panelRect: {
    kind: 'fractional',
    anchorMin: { x: 0.0778, y: 0.1708 },
    anchorMax: { x: 0.9258, y: 0.7904 },
  } satisfies LayoutRect,
  panelBackground: 'rgb(0 0 0 / 0.5098)',

  /** Truncated in the scene dump at 60 chars; the full string ends "puzzle". */
  descriptionRect: {
    kind: 'horizontalBand',
    anchorY: 1,
    anchorMinX: 0,
    anchorMaxX: 1,
    pos: { x: 0, y: 195.6 },
    size: { x: 0, y: 146 },
    pivot: { x: 0.5, y: 1 },
  } satisfies LayoutRect,
  description: {
    fontSizePx: 52,
    colour: '#DFDFDF',
    text: 'Choose one of the following modes to add images to the puzzle',
  } satisfies TextSpec,

  collectionButton: {
    rect: {
      kind: 'point',
      anchor: { x: 0.5, y: 0.5 },
      pos: { x: 0, y: 552 },
      size: { x: 682, y: 682 },
      pivot: { x: 0.5, y: 0.5 },
    } satisfies LayoutRect,
    background: '#212121',
    captionRect: {
      kind: 'horizontalBand',
      anchorY: 1,
      anchorMinX: 0,
      anchorMaxX: 1,
      pos: { x: 0, y: 132 },
      size: { x: 0, y: 50 },
      pivot: { x: 0.5, y: 1 },
    } satisfies LayoutRect,
    caption: {
      fontSizePx: 52,
      colour: '#DFDFDF',
      text: 'Browse and select from MAP’s collection',
    } satisfies TextSpec,
    iconRect: {
      kind: 'point',
      anchor: { x: 0.5, y: 0.5 },
      pos: { x: 0, y: 87 },
      size: { x: 162, y: 162 },
      pivot: { x: 0.5, y: 0.5 },
    } satisfies LayoutRect,
    iconSprite: '/assets/select/gallery-add.png',
    labelRect: {
      kind: 'point',
      anchor: { x: 0.5, y: 0 },
      pos: { x: 0, y: 150.18 },
      size: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0 },
    } satisfies LayoutRect,
    // Authored with an explicit newline.
    label: {
      fontSizePx: 52,
      colour: '#E1E1E1',
      text: "Add from\nMAP's collection",
    } satisfies TextSpec,
  },

  qrPanel: {
    rect: {
      kind: 'point',
      anchor: { x: 0.5, y: 0.5 },
      pos: { x: 0, y: -629.0093 },
      size: { x: 682, y: 682 },
      pivot: { x: 0.5, y: 0.5 },
    } satisfies LayoutRect,
    /** 9-sliced white pill, uniform 255 px border. */
    sprite: '/assets/common/circle-9sliced.png',
    sliceBorderPx: 255,
    captionRect: {
      kind: 'horizontalBand',
      anchorY: 1,
      anchorMinX: 0,
      anchorMaxX: 1,
      pos: { x: 0, y: 154 },
      size: { x: 0, y: 50 },
      pivot: { x: 0.5, y: 1 },
    } satisfies LayoutRect,
    caption: {
      fontSizePx: 52,
      colour: '#DFDFDF',
      text: 'Scan the QR code to upload your own image',
    } satisfies TextSpec,
    /** Stretched with a +100 px overhang on each axis (`sizeDelta = (100,100)`). */
    codeRect: { kind: 'stretch' } satisfies LayoutRect,
    codeSprite: '/assets/qr/qr-code.png',
  },

  /** Decorative divider between the two choices. */
  dividerRect: {
    kind: 'point',
    anchor: { x: 0.5, y: 0.5 },
    pos: { x: 0, y: 68 },
    size: { x: 2, y: 142 },
    pivot: { x: 0.5, y: 0.5 },
  } satisfies LayoutRect,
  dividerSprite: '/assets/common/vertical-line.png',
} as const;

export const CROP_PORTRAIT = {
  screen: {
    rect: { kind: 'stretch' } satisfies LayoutRect,
    background: '/assets/common/background-portrait.png',
  },

  appLogo: IMAGE_SELECT_PORTRAIT.appLogo,
  backButton: IMAGE_SELECT_PORTRAIT.backButton,

  /**
   * The crop stage. Happens to be exactly square:
   * (0.852 − 0.148) × 2160 = 1520.64 = (0.8319 − 0.4359) × 3840.
   */
  stageRect: {
    kind: 'fractional',
    anchorMin: { x: 0.148, y: 0.4359 },
    anchorMax: { x: 0.852, y: 0.8319 },
  } satisfies LayoutRect,
  stageBackground: '#000000',

  /** Instruction, floating ABOVE the stage — note anchorY > 1. */
  descriptionRect: {
    kind: 'fractional',
    anchorMin: { x: 0.0717, y: 1.0977 },
    anchorMax: { x: 0.9283, y: 1.1389 },
  } satisfies LayoutRect,
  description: {
    fontSizePx: 50,
    colour: 'var(--map-white)',
    text: 'Select the part of painting for your Puzzle',
  } satisfies TextSpec,

  /** Initial guide overlay; `CropGridResizer` resizes it at runtime. */
  gridSprite: '/assets/crop/crop-reference-frame.png',
  gridInitialSize: 500,

  /** Corner handles created at runtime: 80 px, white at alpha 0.9. */
  handleSizePx: 80,
  handleColour: 'rgb(255 255 255 / 0.9)',
  /** Grid may shrink to 20 % of its initial size (`minSizeFraction`). */
  minSizeFraction: 0.2,

  rotateButtons: {
    size: { x: 120, y: 120 },
    /** Below the stage: pivot (0.5,0) on anchor y = 0, pos.y = −160. */
    posY: -160,
    /** Anticlockwise sits left, clockwise right. */
    anticlockwisePosX: -100,
    clockwisePosX: 100,
    background: '#000000',
    sprite: '/assets/common/circle-9sliced.png',
    sliceBorderPx: 255,
    iconSprite: '/assets/common/icon-rotate.png',
    iconColour: '#F4A200',
    /** Icon inset 8 px each side (`sizeDelta = (−16,−16)`). */
    iconInsetPx: 8,
  },

  startButton: {
    rect: {
      kind: 'fractional',
      anchorMin: { x: 0.376, y: 0.2454 },
      anchorMax: { x: 0.624, y: 0.299 },
    } satisfies LayoutRect,
    sprite: '/assets/gameplay/start-button.png',
    pressedSprite: '/assets/gameplay/start-button-pressed.png',
    label: { fontSizePx: 100, colour: 'var(--map-white)', text: 'START' } satisfies TextSpec,
  },
} as const;

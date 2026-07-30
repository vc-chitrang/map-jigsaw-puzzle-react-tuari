/**
 * Win screen geometry — portrait, 2160 × 3840.
 *
 * TRANSCRIBED VERBATIM from docs/ui/scene-portrait.md lines 603-661, with text
 * alignments and margins read from the scene YAML directly (the dump does not
 * carry them).
 *
 * NOTE — the screen's own `Background` is `Background_Portrait.png` at
 * **alpha 0**, i.e. fully transparent. The win screen is an OVERLAY: what shows
 * behind it is the solved board with the full-image preview, which the reducer
 * has already switched on by the time this renders. Only `Popup` is opaque.
 *
 * The two score LABELS are zero-sized text objects at the panel centre with
 * `h = Right`, so they extend LEFTWARD from the centre line while the value
 * boxes sit to the right of it (`pos.x = 20`, `pivot.x = 0`). Getting the
 * alignment wrong makes the label overlap its own value box.
 */

import type { LayoutRect } from './rect';
import type { TextSpec } from './portrait';

export const WIN_PORTRAIT = {
  /** Transparent full-screen root; the board and preview stay visible behind. */
  screenRect: { kind: 'stretch' } satisfies LayoutRect,

  popup: {
    rect: {
      kind: 'fractional',
      anchorMin: { x: 0.1528, y: 0.474 },
      anchorMax: { x: 0.8472, y: 0.7865 },
    } satisfies LayoutRect,
    /** #64787E at alpha 0.5882. */
    background: 'rgb(100 120 126 / 0.5882)',
    /** DesignMask: 9-sliced white pill, uniform 255 px border. */
    maskSprite: '/assets/common/circle-9sliced.png',
    maskSliceBorderPx: 255,
    /** PatternDesign: #007CC4 at alpha 0.3922, over the mask. */
    patternColour: 'rgb(0 124 196 / 0.3922)',
    outlineColour: 'var(--map-white)',
  },

  /** "You Win!" banner, hanging from the popup's top edge. */
  youWin: {
    rect: {
      kind: 'point',
      anchor: { x: 0.5, y: 1 },
      pos: { x: 0, y: -100 },
      size: { x: 500, y: 150 },
      pivot: { x: 0.5, y: 1 },
    } satisfies LayoutRect,
    /** MAP Gulabi. */
    background: 'var(--map-gulabi)',
    text: { fontSizePx: 80, colour: 'var(--map-white)', text: 'You Win!' } satisfies TextSpec,
  },

  /** This run's time. Box sits RIGHT of centre; label sits left of it. */
  yourScore: {
    boxRect: {
      kind: 'point',
      anchor: { x: 0.5, y: 0.5 },
      pos: { x: 20, y: 100 },
      size: { x: 400, y: 130 },
      pivot: { x: 0, y: 0.5 },
    } satisfies LayoutRect,
    boxBackground: '#88A35C',
    value: { fontSizePx: 80, colour: 'var(--map-white)' } satisfies TextSpec,
    labelRect: {
      kind: 'point',
      anchor: { x: 0.5, y: 0.5 },
      pos: { x: 0, y: 100 },
      size: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    } satisfies LayoutRect,
    label: { fontSizePx: 60, colour: 'var(--map-white)', text: 'Your Score:' } satisfies TextSpec,
  },

  /** Best time for this artwork. `--:--` when there is no record. */
  highScore: {
    boxRect: {
      kind: 'point',
      anchor: { x: 0.5, y: 0.5 },
      pos: { x: 20, y: -100 },
      size: { x: 400, y: 130 },
      pivot: { x: 0, y: 0.5 },
    } satisfies LayoutRect,
    boxBackground: '#64787E',
    value: { fontSizePx: 80, colour: 'var(--map-white)' } satisfies TextSpec,
    labelRect: {
      kind: 'point',
      anchor: { x: 0.5, y: 0.5 },
      pos: { x: 0, y: -100 },
      size: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    } satisfies LayoutRect,
    label: {
      fontSizePx: 60,
      colour: 'var(--map-white)',
      text: 'High Score Time:',
    } satisfies TextSpec,
  },

  playAgain: {
    rect: {
      kind: 'point',
      anchor: { x: 0.5, y: 0 },
      pos: { x: 0, y: 100 },
      size: { x: 530, y: 178 },
      pivot: { x: 0.5, y: 0 },
    } satisfies LayoutRect,
    sprite: '/assets/gameplay/play-again-button.png',
    pressedSprite: '/assets/gameplay/play-again-button-pressed.png',
    label: {
      fontSizePx: 82,
      colour: 'var(--map-white)',
      text: 'Play Again?',
      marginPx: { left: 20, top: 0, right: 0, bottom: 20 },
    } satisfies TextSpec,
  },
} as const;

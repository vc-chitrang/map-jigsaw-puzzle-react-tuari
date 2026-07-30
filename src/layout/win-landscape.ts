/**
 * Win screen geometry — LANDSCAPE, 3840 × 2160.
 *
 * TRANSCRIBED VERBATIM from docs/ui/scene-landscape.md lines 630-688, with text
 * alignments, margins and auto-sizing read from the scene YAML directly.
 *
 * Same overlay rule as portrait (ADR-018): the screen's own `Background` is
 * `Background_Portrait.png` — the landscape scene really does reference the
 * portrait sprite here — at **alpha 0**, so only `Popup` is opaque and the solved
 * board with its preview stays visible behind.
 *
 * The two score LABELS are zero-sized text objects at the panel centre with
 * `m_HorizontalAlignment = 4` (Right), so they extend LEFTWARD from the centre
 * line while the value boxes sit to its right (`pos.x = 20`, `pivot.x = 0`).
 * Identical to portrait; getting it wrong overlaps a label with its own box.
 *
 * DIFFERENCES FROM PORTRAIT:
 *
 *   |                  | portrait | landscape |
 *   |---|---|---|
 *   | popup            | 0.1528-0.8472 / 0.474-0.7865 | **0.3351-0.6649 / 0.3118-0.7808** |
 *   | "You Win!" panel | 500 × 150, text 80 (auto ≤ 80) | **400 × 120, text 72 (fixed)** |
 *   | score boxes      | 400 × 130, value 80 | **320 × 104, value 74.2** |
 *   | score value TMP margin | none | **(10, 10, 10, 10)** |
 *   | score labels     | 60 px | 60 px (unchanged) |
 *   | Play Again       | 530 × 178, label 82, margin (20,0,0,20) | **475.04 × 120, label 68, margin (12,0,0,12)** |
 *
 * One value is deliberately recorded but not rendered: `PatternDesign` carries
 * `sizeDelta (2340, 960)` here (portrait has `(0, 0)`), i.e. it overhangs its
 * parent by 1170 × 480 px. It is a FLAT colour clipped by `DesignMask`, so the
 * overhang cannot show — stretching it to the mask is pixel-identical.
 */

import type { LayoutRect } from './rect';
import type { TextSpec } from './portrait';

export const WIN_LANDSCAPE = {
  /** Transparent full-screen root; the board and preview stay visible behind. */
  screenRect: { kind: 'stretch' } satisfies LayoutRect,

  popup: {
    rect: {
      kind: 'fractional',
      anchorMin: { x: 0.3351, y: 0.3118 },
      anchorMax: { x: 0.6649, y: 0.7808 },
    } satisfies LayoutRect,
    /** #64787E at alpha 0.5882. */
    background: 'rgb(100 120 126 / 0.5882)',
    /** DesignMask: 9-sliced white pill, uniform 255 px border. */
    maskSprite: '/assets/common/circle-9sliced.png',
    maskSliceBorderPx: 255,
    /** PatternDesign: #007CC4 at alpha 0.3922, over the mask. */
    patternColour: 'rgb(0 124 196 / 0.3922)',
    /** Scene overhang, inert because the fill is flat and masked. See the header. */
    patternOverhangPx: { x: 2340, y: 960 },
    outlineColour: 'var(--map-white)',
  },

  /** "You Win!" banner, hanging from the popup's top edge. */
  youWin: {
    rect: {
      kind: 'point',
      anchor: { x: 0.5, y: 1 },
      pos: { x: 0, y: -100 },
      size: { x: 400, y: 120 },
      pivot: { x: 0.5, y: 1 },
    } satisfies LayoutRect,
    /** MAP Gulabi. */
    background: 'var(--map-gulabi)',
    text: { fontSizePx: 72, colour: 'var(--map-white)', text: 'You Win!' } satisfies TextSpec,
  },

  /** This run's time. Box sits RIGHT of centre; label sits left of it. */
  yourScore: {
    boxRect: {
      kind: 'point',
      anchor: { x: 0.5, y: 0.5 },
      pos: { x: 20, y: 100 },
      size: { x: 320, y: 104 },
      pivot: { x: 0, y: 0.5 },
    } satisfies LayoutRect,
    boxBackground: '#88A35C',
    value: {
      fontSizePx: 74.2,
      colour: 'var(--map-white)',
      marginPx: { left: 10, top: 10, right: 10, bottom: 10 },
    } satisfies TextSpec,
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
      size: { x: 320, y: 104 },
      pivot: { x: 0, y: 0.5 },
    } satisfies LayoutRect,
    boxBackground: '#64787E',
    value: {
      fontSizePx: 74.2,
      colour: 'var(--map-white)',
      marginPx: { left: 10, top: 10, right: 10, bottom: 10 },
    } satisfies TextSpec,
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
      size: { x: 475.04, y: 120 },
      pivot: { x: 0.5, y: 0 },
    } satisfies LayoutRect,
    sprite: '/assets/gameplay/play-again-button.svg',
    pressedSprite: '/assets/gameplay/play-again-button-pressed.svg',
    label: {
      fontSizePx: 68,
      colour: 'var(--map-white)',
      text: 'Play Again?',
      marginPx: { left: 12, top: 0, right: 0, bottom: 12 },
    } satisfies TextSpec,
  },
} as const;

/**
 * Tunable constants.
 *
 * SOURCE OF TRUTH: the **scene-serialized** GameManager values, read from
 * `Scenes/MAP_PuzzleScene_Portrait.unity` and `..._Landscape.unity`.
 *
 * NOT the C# field initialisers. `docs/game-logic.md §11` transcribed the
 * initialisers in `GameManager.cs`, but Unity serializes the designer-tuned
 * values into the scene and those override the initialisers at runtime. Four
 * constants differ, and the difference is visible:
 *
 * | Constant                | C# default | Portrait scene | Landscape scene |
 * |-------------------------|-----------:|---------------:|----------------:|
 * | `boardPaddingFactor`    |        0.9 |      **0.704** |        **0.68** |
 * | `tileSpacing`           |          2 |          **6** |           **6** |
 * | `shuffleMoveMultiplier` |          3 |          **1** |           **1** |
 * | `arrowSizeFactor`       |       0.38 |       **0.35** |        **0.35** |
 *
 * With `shuffleMoveMultiplier = 1`, `max(12, 3×3×1)` is **12** shuffle moves,
 * not 27.
 */

import type { GridSize, Orientation, Point } from './types';

/** `predefinedBoardSize`, with `isBoardSizePredefined = true`. */
export const GRID: GridSize = { cols: 3, rows: 3 };

/** Per-orientation board tuning, as serialized in each scene. */
export interface BoardTuning {
  /** Board edge = `min(parentW, parentH) × paddingFactor`. */
  readonly paddingFactor: number;
  /** Gap between tiles. Also the outline's OUTWARD overhang. */
  readonly tileSpacing: number;
  /** Arrow edge = `cellSize × arrowSizeFactor`. */
  readonly arrowSizeFactor: number;
  /** Shuffle length = `max(12, cols × rows × shuffleMoveMultiplier)`. */
  readonly shuffleMoveMultiplier: number;
  /**
   * `BoardPanel.anchoredPosition` from the centre of the screen.
   *
   * Unity values, so **y is UP**: portrait `y = 514` means the board sits 514 px
   * ABOVE centre. Convert at render time, once.
   */
  readonly panelOffset: Point;
}

export const BOARD_TUNING: Record<Orientation, BoardTuning> = {
  portrait: {
    paddingFactor: 0.704,
    tileSpacing: 6,
    arrowSizeFactor: 0.35,
    shuffleMoveMultiplier: 1,
    panelOffset: { x: 0, y: 514 },
  },
  landscape: {
    paddingFactor: 0.68,
    tileSpacing: 6,
    arrowSizeFactor: 0.35,
    shuffleMoveMultiplier: 1,
    panelOffset: { x: 0, y: 100 },
  },
};

/** Floor on shuffle length regardless of grid size (`Mathf.Max(12, …)`). */
export const MIN_SHUFFLE_MOVES = 12;

/**
 * Bound on the "landed solved, shuffle again" retry.
 *
 * Unity recurses without a limit (docs/architecture.md §1.3 fragility 3). A
 * bounded loop removes the stack-overflow path; the fallback is still an
 * unsolved board in every realistic case, and `ShuffleResult.exhausted` reports
 * the pathological one rather than hiding it.
 */
export const MAX_SHUFFLE_ATTEMPTS = 10;

/** Tile slide duration, seconds. `Ease.OutCubic`. Same in both scenes. */
export const TILE_MOVE_DURATION_S = 0.14;

/** Arrow idle pulse: `scale 1 → 1.06`, linear, yoyo, infinite. */
export const ARROW_PULSE_DURATION_S = 0.25;
export const ARROW_PULSE_SCALE = 1.06;

/** Attract-mode auto-shuffle cadence, seconds. */
export const AUTO_SHUFFLE_INTERVAL_S = 1;

/** Realtime delay between the winning move's reveal and the win screen. */
export const WIN_SCREEN_DELAY_S = 1;

/** Screen cross-fade, per half. Total 0.4 s. */
export const SCREEN_FADE_DURATION_S = 0.2;

/** Footer label + icon alpha while a button is non-interactive. */
export const DISABLED_ALPHA = 0.3;

/** Label + icon nudge while a button is held, in reference px (down-left). */
export const PRESS_OFFSET_PX = 10;

/** Unity `Application.productName`, used in the high-score key. */
export const PRODUCT_NAME = 'MAP Jigsaw Puzzle';

/** Sentinel for "no high score recorded". Renders as `--:--`. */
export const NO_HIGH_SCORE = -1;

/** Collection page size (`_itemsPerPage`). Used from Phase 3. */
export const ITEMS_PER_PAGE = 40;

/**
 * Number of shuffle moves: `max(12, cols × rows × multiplier)`.
 *
 * Defaults to the portrait tuning, which matches landscape anyway.
 */
export function shuffleMoveCount(
  size: GridSize = GRID,
  multiplier: number = BOARD_TUNING.portrait.shuffleMoveMultiplier,
): number {
  return Math.max(MIN_SHUFFLE_MOVES, size.cols * size.rows * multiplier);
}

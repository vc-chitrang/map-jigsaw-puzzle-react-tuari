/**
 * Shuffling and attract-mode auto-shuffle — docs/game-logic.md §3, §6.1.
 *
 * The shuffle is MOVE-BASED, never an index permutation. A random permutation of
 * a sliding-tile board is unsolvable about half the time and needs an inversion-
 * parity correction; performing N random *legal* moves from the solved state
 * makes solvability true by construction (ADR-001).
 */

import { MAX_SHUFFLE_ATTEMPTS, shuffleMoveCount } from './constants';
import { applyMove, movableCells } from './moves';
import { cellsEqual, createSolvedBoard, isSolved } from './board';
import type { BoardState, Cell, GridSize, Rng } from './types';

/**
 * Sentinel for "no previous empty cell yet" — Unity uses `(-100, -100)`, which
 * can never equal a real cell, so the first move has nothing to avoid.
 */
const NO_PREVIOUS_CELL: Cell = { x: -100, y: -100 };

export interface ShuffleOptions {
  readonly rng?: Rng;
  /** Defaults to `max(12, cols × rows × 3)`. */
  readonly moves?: number;
  readonly maxAttempts?: number;
}

export interface ShuffleResult {
  readonly board: BoardState;
  /** How many passes were needed; > 1 means a pass landed on the solved state. */
  readonly attempts: number;
  /**
   * True if every attempt landed solved and the last one was returned anyway.
   * Practically unreachable; surfaced rather than hidden so it can be asserted.
   */
  readonly exhausted: boolean;
}

function pickRandom<T>(items: readonly T[], rng: Rng): T | undefined {
  if (items.length === 0) return undefined;
  const index = Math.floor(rng() * items.length);
  // rng() is specified as [0, 1), but a sloppy implementation returning exactly 1
  // would index out of bounds. Clamp rather than trust.
  return items[Math.min(index, items.length - 1)];
}

/** One pass of `moves` random legal moves from `start`. */
function shufflePass(start: BoardState, moves: number, rng: Rng): BoardState {
  let board = start;
  let previousEmpty = NO_PREVIOUS_CELL;

  for (let i = 0; i < moves; i += 1) {
    const candidates = movableCells(board);

    // Avoid immediately undoing the previous move — but only when there is
    // another option, otherwise the pass would stall.
    const filtered =
      candidates.length > 1
        ? candidates.filter((cell) => !cellsEqual(cell, previousEmpty))
        : candidates;

    const chosen = pickRandom(filtered, rng);
    if (!chosen) continue;

    previousEmpty = board.emptyCell;
    const next = applyMove(board, chosen);
    // `movableCells` only ever returns legal moves, so this cannot be null.
    if (next) board = next;
  }

  return board;
}

/**
 * Shuffle a board by random legal moves.
 *
 * Retries if a pass happens to land back on the solved state. Unity recurses
 * here without a bound; this loops at most `maxAttempts` times so there is no
 * stack-overflow path (docs/architecture.md §1.3).
 */
export function shuffleBoard(board: BoardState, options: ShuffleOptions = {}): ShuffleResult {
  const rng = options.rng ?? Math.random;
  const moves = options.moves ?? shuffleMoveCount(board.size);
  const maxAttempts = options.maxAttempts ?? MAX_SHUFFLE_ATTEMPTS;

  let result = board;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    result = shufflePass(board, moves, rng);
    if (!isSolved(result)) {
      return { board: result, attempts: attempt, exhausted: false };
    }
  }

  return { board: result, attempts: maxAttempts, exhausted: true };
}

/** Convenience: a fresh shuffled board of `size`. */
export function createShuffledBoard(
  size: GridSize | undefined = undefined,
  options: ShuffleOptions = {},
): ShuffleResult {
  return shuffleBoard(size ? createSolvedBoard(size) : createSolvedBoard(), options);
}

/**
 * Pick the next attract-mode auto-shuffle move.
 *
 * Same no-immediate-reversal rule as the shuffle, but the "previous" cell is
 * tracked by the caller across ticks (`lastAutoMoveFrom` in `AutoShuffleRoutine`)
 * because each tick is a separate animated move.
 *
 * @returns the cell to move, or `null` if there is nothing to move.
 */
export function pickAutoShuffleMove(
  board: BoardState,
  lastAutoMoveFrom: Cell | null,
  rng: Rng = Math.random,
): Cell | null {
  const candidates = movableCells(board);

  const filtered =
    candidates.length > 1 && lastAutoMoveFrom
      ? candidates.filter((cell) => !cellsEqual(cell, lastAutoMoveFrom))
      : candidates;

  return pickRandom(filtered, rng) ?? null;
}

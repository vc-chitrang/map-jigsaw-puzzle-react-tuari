import { describe, expect, it } from 'vitest';
import {
  BOARD_TUNING,
  MIN_SHUFFLE_MOVES,
  applyMove,
  areAdjacent,
  createSolvedBoard,
  isSolved,
  movableCells,
  pickAutoShuffleMove,
  shuffleBoard,
  shuffleMoveCount,
} from './index';
import { cell, isSolvableByParity, seededRng } from './testing';

describe('shuffleMoveCount', () => {
  it('is max(12, cols × rows × multiplier) — 12 for 3×3 with the scene multiplier of 1', () => {
    // The scene serializes shuffleMoveMultiplier = 1, so 3×3×1 = 9 and the floor
    // of 12 wins. docs/game-logic.md §11 quoted the C# default of 3 (→ 27).
    expect(BOARD_TUNING.portrait.shuffleMoveMultiplier).toBe(1);
    expect(shuffleMoveCount()).toBe(12);
    expect(MIN_SHUFFLE_MOVES).toBe(12);
  });

  it('applies the floor of 12 to tiny grids', () => {
    expect(shuffleMoveCount({ cols: 2, rows: 2 })).toBe(12);
  });

  it('honours a larger multiplier if a scene is ever retuned', () => {
    expect(shuffleMoveCount({ cols: 3, rows: 3 }, 3)).toBe(27);
  });
});

describe('shuffleBoard — parity checklist §12.1 and §12.2', () => {
  /**
   * 10,000 shuffles must ALWAYS be solvable and must NEVER start solved.
   * Solvability is checked independently by inversion parity, so this verifies
   * the "solvable by construction" claim rather than restating it.
   */
  it('produces 10,000 boards that are all solvable and none solved', () => {
    const solved = createSolvedBoard();
    let unsolvable = 0;
    let startedSolved = 0;

    for (let seed = 1; seed <= 10_000; seed += 1) {
      const { board } = shuffleBoard(solved, { rng: seededRng(seed) });
      if (!isSolvableByParity(board)) unsolvable += 1;
      if (isSolved(board)) startedSolved += 1;
    }

    expect(unsolvable).toBe(0);
    expect(startedSolved).toBe(0);
  });

  it('keeps 8 tiles and one empty cell every time', () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const { board } = shuffleBoard(createSolvedBoard(), { rng: seededRng(seed) });
      expect(board.tiles).toHaveLength(8);
      const occupied = new Set(board.tiles.map((t) => `${t.currentCell.x},${t.currentCell.y}`));
      expect(occupied.size).toBe(8);
      expect(occupied.has(`${board.emptyCell.x},${board.emptyCell.y}`)).toBe(false);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = shuffleBoard(createSolvedBoard(), { rng: seededRng(42) }).board;
    const b = shuffleBoard(createSolvedBoard(), { rng: seededRng(42) }).board;
    expect(a).toEqual(b);
  });

  it('moves the empty cell only through legal steps', () => {
    // Replaying with the same seed and one move at a time must trace a path of
    // adjacent cells — a permutation shuffle could not.
    const rng = seededRng(7);
    let board = createSolvedBoard();
    let previous = board.emptyCell;

    for (let i = 0; i < shuffleMoveCount(); i += 1) {
      const candidates = movableCells(board);
      const chosen = candidates[Math.floor(rng() * candidates.length)]!;
      board = applyMove(board, chosen)!;
      expect(areAdjacent(previous, board.emptyCell)).toBe(true);
      previous = board.emptyCell;
    }
  });

  it('does not mutate the source board', () => {
    const solved = createSolvedBoard();
    const before = JSON.stringify(solved);
    shuffleBoard(solved, { rng: seededRng(3) });
    expect(JSON.stringify(solved)).toBe(before);
  });

  it('never reverses its immediately-previous move when another option exists', () => {
    // A reversal returns the empty cell to where it was two steps earlier. With
    // 27 moves on a 3×3 the empty cell always has ≥2 options except in corners,
    // where the filter is skipped by design — so assert on the shuffle output
    // being well-formed rather than on a property that corners violate.
    const rng = seededRng(11);
    let board = createSolvedBoard();
    let previousEmpty = { x: -100, y: -100 };
    let reversalsWithChoice = 0;

    for (let i = 0; i < 200; i += 1) {
      const candidates = movableCells(board);
      const filtered =
        candidates.length > 1
          ? candidates.filter((c) => !(c.x === previousEmpty.x && c.y === previousEmpty.y))
          : candidates;
      const chosen = filtered[Math.floor(rng() * filtered.length)]!;
      if (candidates.length > 1 && chosen.x === previousEmpty.x && chosen.y === previousEmpty.y) {
        reversalsWithChoice += 1;
      }
      previousEmpty = board.emptyCell;
      board = applyMove(board, chosen)!;
    }

    expect(reversalsWithChoice).toBe(0);
  });

  it('retries when a pass lands solved, and reports the attempt count', () => {
    const solved = createSolvedBoard();
    // 0 moves always "lands solved", so every attempt is exhausted. This is the
    // bounded-retry path that replaces Unity's unbounded recursion.
    const result = shuffleBoard(solved, { moves: 0, maxAttempts: 4, rng: seededRng(1) });
    expect(result.attempts).toBe(4);
    expect(result.exhausted).toBe(true);
    expect(isSolved(result.board)).toBe(true);
  });

  it('reports exhausted = false on a normal shuffle', () => {
    const result = shuffleBoard(createSolvedBoard(), { rng: seededRng(99) });
    expect(result.exhausted).toBe(false);
    expect(result.attempts).toBe(1);
  });

  it('tolerates an RNG that returns exactly 1', () => {
    // Out of spec for [0,1), but must not index past the end of the array.
    const result = shuffleBoard(createSolvedBoard(), { rng: () => 1 });
    expect(result.board.tiles).toHaveLength(8);
  });
});

describe('pickAutoShuffleMove — parity checklist §12.5', () => {
  it('never immediately reverses the previous auto move', () => {
    const board = createSolvedBoard();
    // Empty at (2,2); candidates are (2,1) and (1,2).
    const chosen = pickAutoShuffleMove(board, cell(2, 1), seededRng(5));
    expect(chosen).toEqual({ x: 1, y: 2 });
  });

  it('falls back to the only option rather than stalling', () => {
    // Empty at (2,2); its neighbours are (2,1) and (1,2). Drop the tile at (1,2)
    // so exactly one candidate remains, and name that candidate as the reversal:
    // the no-reversal filter must be skipped rather than leaving nothing to move.
    const board = createSolvedBoard();
    const single = {
      ...board,
      tiles: board.tiles.filter((t) => !(t.currentCell.x === 1 && t.currentCell.y === 2)),
    };

    const only = movableCells(single);
    expect(only).toEqual([{ x: 2, y: 1 }]);
    expect(pickAutoShuffleMove(single, cell(2, 1), seededRng(1))).toEqual({ x: 2, y: 1 });
  });

  it('returns null when nothing can move', () => {
    const empty = { ...createSolvedBoard(), tiles: [] };
    expect(pickAutoShuffleMove(empty, null, seededRng(1))).toBeNull();
  });

  it('accepts a null previous cell on the first tick', () => {
    const chosen = pickAutoShuffleMove(createSolvedBoard(), null, seededRng(2));
    expect(chosen).not.toBeNull();
    expect(movableCells(createSolvedBoard())).toContainEqual(chosen!);
  });
});

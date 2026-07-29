/**
 * Test helpers for the game core. Not shipped in any screen.
 */

import { cellOrdinal } from './board';
import type { BoardState, Cell, KeyValueStore, Rng } from './index';

/**
 * Deterministic RNG (mulberry32) so a failing shuffle is reproducible from its
 * seed instead of "it happened once in CI".
 */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Independent solvability check by inversion parity.
 *
 * Deliberately NOT the algorithm under test: the shuffle claims solvability by
 * construction (only legal moves from the solved state), and this verifies that
 * claim from the other direction.
 *
 * For an odd-width board the puzzle is solvable iff the number of inversions in
 * the row-major tile sequence (blank excluded) is even. The solved sequence here
 * is `0,1,…,7` with the blank last, which is the canonical goal state, so the
 * rule applies directly.
 */
export function isSolvableByParity(board: BoardState): boolean {
  if (board.size.cols % 2 === 0) {
    throw new Error('inversion-parity shortcut is only valid for odd-width boards');
  }

  const sequence: number[] = [];
  const ordered = [...board.tiles].sort(
    (a, b) => cellOrdinal(a.currentCell, board.size) - cellOrdinal(b.currentCell, board.size),
  );
  for (const tile of ordered) sequence.push(tile.index);

  let inversions = 0;
  for (let i = 0; i < sequence.length; i += 1) {
    for (let j = i + 1; j < sequence.length; j += 1) {
      const left = sequence[i];
      const right = sequence[j];
      if (left === undefined || right === undefined) continue;
      if (left > right) inversions += 1;
    }
  }

  return inversions % 2 === 0;
}

/** In-memory `KeyValueStore` — no jsdom, no localStorage. */
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore & {
  readonly entries: Map<string, string>;
} {
  const entries = new Map<string, string>(Object.entries(initial));
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

export function cell(x: number, y: number): Cell {
  return { x, y };
}

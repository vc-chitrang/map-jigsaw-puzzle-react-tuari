/**
 * Core puzzle types.
 *
 * PURE MODULE — no React, no DOM, no browser globals. Everything in `src/game/`
 * obeys that rule so the parity checklist in docs/game-logic.md §12 is testable
 * headlessly (docs/architecture.md §2.1).
 *
 * COORDINATES: grid `y` increases DOWNWARD (`y = 0` is the top row), matching
 * `GameManager`. Unity UI `y` increases upward, so the Unity source negates `y`
 * on every grid→screen conversion. CSS `y` is already downward, so those
 * negations are absent here. Do not re-introduce them
 * (docs/game-logic.md §1.1, docs/pixel-perfect-replication.md §2).
 */

/**
 * Which kiosk build. Portrait (2160×3840) is primary; landscape is Phase 6.
 * Lives here because the board tuning differs per orientation and `src/game/`
 * is the lowest layer — `src/canvas/` imports this rather than redefining it.
 */
export type Orientation = 'portrait' | 'landscape';

/** A grid coordinate. `x` = column (0 = left), `y` = row (0 = TOP). */
export interface Cell {
  readonly x: number;
  readonly y: number;
}

export interface GridSize {
  readonly cols: number;
  readonly rows: number;
}

export interface Tile {
  /** Creation order, 0..(cols*rows - 2). Row-major, skipping the empty cell. */
  readonly index: number;
  /** Where this tile belongs — its spawn cell. Drives the image slice offset. */
  readonly correctCell: Cell;
  /** Where it is now. Drives the on-screen position. */
  readonly currentCell: Cell;
}

export interface BoardState {
  readonly size: GridSize;
  readonly tiles: readonly Tile[];
  readonly emptyCell: Cell;
}

/** Board pixel geometry, in reference-resolution px. */
export interface BoardGeometry {
  /** Always square. */
  readonly boardSize: number;
  readonly cellSize: number;
  readonly spacing: number;
}

/** A position in board-local reference px, top-left origin. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Injectable random source. Defaults to `Math.random`, replaced by a seeded
 * generator in tests so a failing shuffle is reproducible.
 * Contract: returns a float in [0, 1).
 */
export type Rng = () => number;

/** Who caused a move. Only `player` moves start the timer or count.  */
export type MoveSource = 'player' | 'auto';

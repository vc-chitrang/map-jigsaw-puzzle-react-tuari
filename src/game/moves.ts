/**
 * Movement, adjacency and the arrow system — docs/game-logic.md §4, §5.
 */

import { BOARD_TUNING, type BoardTuning } from './constants';
import { cellPosition, cellsEqual, hasTileAt, isInsideGrid, tileAt } from './board';
import type { BoardGeometry, BoardState, Cell, Point } from './types';

/**
 * `AreAdjacent(a, b)` — Manhattan distance of exactly 1.
 *
 * Note this is distance **1**, not "within 1": a cell is not adjacent to itself,
 * and diagonals never qualify.
 */
export function areAdjacent(a: Cell, b: Cell): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

/**
 * Cells whose tile can legally slide into the empty slot: inside the grid,
 * adjacent to the empty cell, and actually holding a tile.
 *
 * Returned in the order up, down, left, right — matching
 * `GameManager.ArrowGridDirections`, so shuffle selection is deterministic for
 * a given RNG sequence.
 */
export function movableCells(state: BoardState): Cell[] {
  const { emptyCell, size } = state;

  return ARROW_DIRECTIONS.map((dir) => ({
    x: emptyCell.x + dir.offset.x,
    y: emptyCell.y + dir.offset.y,
  })).filter((cell) => isInsideGrid(cell, size) && hasTileAt(state, cell));
}

export function canMove(state: BoardState, cell: Cell): boolean {
  if (!isInsideGrid(cell, state.size)) return false;
  if (!areAdjacent(cell, state.emptyCell)) return false;
  return hasTileAt(state, cell);
}

/**
 * Slide the tile at `cell` into the empty slot.
 *
 * @returns the new board, or `null` if the move is illegal.
 *
 * Unity performs this state update BEFORE starting the tween, so logic never
 * waits on animation and input is gated separately by `_isAnimating`
 * (docs/game-logic.md §4.2, docs/architecture.md §1.2). Keeping that ordering
 * means the reducer is synchronous and the animation is purely presentational.
 */
export function applyMove(state: BoardState, cell: Cell): BoardState | null {
  if (!canMove(state, cell)) return null;

  const moving = tileAt(state, cell);
  if (!moving) return null;

  const destination = state.emptyCell;

  return {
    ...state,
    emptyCell: cell,
    tiles: state.tiles.map((tile) =>
      tile.index === moving.index ? { ...tile, currentCell: destination } : tile,
    ),
  };
}

/**
 * The four arrows, in `GameManager.ArrowGridDirections` order.
 *
 * `offset` is measured FROM the empty cell TO the tile that arrow pulls in, in
 * grid coordinates (y down). `asset` is the normalised sprite name written by
 * scripts/copy-assets.ps1 — upstream the files are named after the offset
 * itself (`0_-1.svg` etc.).
 */
export const ARROW_DIRECTIONS = [
  { offset: { x: 0, y: -1 }, asset: 'arrow-up.svg', label: 'above' },
  { offset: { x: 0, y: 1 }, asset: 'arrow-down.svg', label: 'below' },
  { offset: { x: -1, y: 0 }, asset: 'arrow-left.svg', label: 'left' },
  { offset: { x: 1, y: 0 }, asset: 'arrow-right.svg', label: 'right' },
] as const satisfies readonly {
  offset: Point;
  asset: string;
  label: string;
}[];

export interface ArrowPlacement {
  /** Index into `ARROW_DIRECTIONS`. */
  readonly index: number;
  readonly asset: string;
  /** Cell whose tile this arrow moves. */
  readonly targetCell: Cell;
  /** Top-left position in board-local px. */
  readonly position: Point;
  readonly size: number;
}

/**
 * Visible arrows and where they sit.
 *
 * Each arrow straddles the edge between the empty cell and its neighbour:
 * half a stride from the empty cell's centre, at 38 % of a cell in size.
 *
 * Unity negates `dir.y` here because Unity UI y is up. CSS y is already down,
 * so the negation is ABSENT — this is the single most likely place to introduce
 * a double-negation bug (docs/game-logic.md §5,
 * docs/pixel-perfect-replication.md §5.2).
 *
 * Arrows are hidden while a tile animates and stay hidden after a win; that is
 * a rendering concern, so callers gate on it rather than this function.
 */
export function arrowPlacements(
  state: BoardState,
  geometry: BoardGeometry,
  tuning: BoardTuning = BOARD_TUNING.portrait,
): ArrowPlacement[] {
  const half = (geometry.cellSize + geometry.spacing) / 2;
  const arrowSize = geometry.cellSize * tuning.arrowSizeFactor;
  const emptyPosition = cellPosition(state.emptyCell, geometry);

  // The empty cell's centre, since the arrow is centred on the shared edge.
  const emptyCentre: Point = {
    x: emptyPosition.x + geometry.cellSize / 2,
    y: emptyPosition.y + geometry.cellSize / 2,
  };

  const placements: ArrowPlacement[] = [];

  ARROW_DIRECTIONS.forEach((direction, index) => {
    const targetCell: Cell = {
      x: state.emptyCell.x + direction.offset.x,
      y: state.emptyCell.y + direction.offset.y,
    };

    if (!isInsideGrid(targetCell, state.size)) return;
    if (!hasTileAt(state, targetCell)) return;

    placements.push({
      index,
      asset: direction.asset,
      targetCell,
      position: {
        x: emptyCentre.x + direction.offset.x * half - arrowSize / 2,
        y: emptyCentre.y + direction.offset.y * half - arrowSize / 2,
      },
      size: arrowSize,
    });
  });

  return placements;
}

/** The cell revealed on win — where the 9th slice is painted. */
export function lastMissingCell(state: BoardState): Cell {
  return state.emptyCell;
}

/** True when `cell` is the board's initial empty slot (bottom-right). */
export function isInitialEmptyCell(cell: Cell, state: BoardState): boolean {
  return cellsEqual(cell, { x: state.size.cols - 1, y: state.size.rows - 1 });
}

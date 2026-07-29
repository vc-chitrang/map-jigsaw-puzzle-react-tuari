/**
 * Board model and geometry — docs/game-logic.md §1, §2.
 */

import { BOARD_TUNING, GRID, type BoardTuning } from './constants';
import type { BoardGeometry, BoardState, Cell, GridSize, Point, Tile } from './types';

export function cellsEqual(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

export function isInsideGrid(cell: Cell, size: GridSize): boolean {
  return cell.x >= 0 && cell.x < size.cols && cell.y >= 0 && cell.y < size.rows;
}

/** Row-major ordinal of a cell — the tile creation order. */
export function cellOrdinal(cell: Cell, size: GridSize): number {
  return cell.y * size.cols + cell.x;
}

export function tileAt(state: BoardState, cell: Cell): Tile | undefined {
  return state.tiles.find((tile) => cellsEqual(tile.currentCell, cell));
}

export function hasTileAt(state: BoardState, cell: Cell): boolean {
  return tileAt(state, cell) !== undefined;
}

/**
 * The solved board.
 *
 * Tiles are created in row-major order **skipping the bottom-right cell**, which
 * becomes the initial empty slot. `index` therefore runs 0..(cols*rows-2) and
 * each tile's `correctCell` is its spawn cell (docs/game-logic.md §1.2).
 */
export function createSolvedBoard(size: GridSize = GRID): BoardState {
  const emptyCell: Cell = { x: size.cols - 1, y: size.rows - 1 };
  const tiles: Tile[] = [];

  for (let y = 0; y < size.rows; y += 1) {
    for (let x = 0; x < size.cols; x += 1) {
      const cell: Cell = { x, y };
      if (cellsEqual(cell, emptyCell)) continue;
      tiles.push({ index: tiles.length, correctCell: cell, currentCell: cell });
    }
  }

  return { size, tiles, emptyCell };
}

/**
 * `CheckSolved()` — every spawned tile is home.
 *
 * The empty cell is deliberately not checked: with 8 of 9 tiles correct the 9th
 * is implied (docs/game-logic.md §4.3).
 */
export function isSolved(state: BoardState): boolean {
  return state.tiles.every((tile) => cellsEqual(tile.currentCell, tile.correctCell));
}

/**
 * Board pixel geometry. The board is always a perfect square sized from the
 * SHORTER parent axis (`ResizeBoardToSquare`).
 *
 * `tuning` defaults to the portrait scene values. Pass the landscape tuning for
 * that build — the padding factor differs (0.704 vs 0.68).
 */
export function computeBoardGeometry(
  parentWidth: number,
  parentHeight: number,
  tuning: BoardTuning = BOARD_TUNING.portrait,
  size: GridSize = GRID,
): BoardGeometry {
  const boardSize = Math.min(parentWidth, parentHeight) * tuning.paddingFactor;
  const spacing = tuning.tileSpacing;
  const cellSize = (boardSize - spacing * (size.cols - 1)) / size.cols;
  return { boardSize, cellSize, spacing };
}

/**
 * Top-left position of a cell in board-local px.
 *
 * Unity produces these with a `GridLayoutGroup` and then caches them and
 * disables the layout group so tiles can be tweened freely. Computing them
 * directly is equivalent and has no layout dependency
 * (docs/game-logic.md §1.3, docs/pixel-perfect-replication.md §5).
 */
export function cellPosition(cell: Cell, geometry: BoardGeometry): Point {
  const stride = geometry.cellSize + geometry.spacing;
  return { x: cell.x * stride, y: cell.y * stride };
}

/**
 * Background-position offset for a tile's image slice.
 *
 * Driven by `correctCell`, NOT `currentCell` — the slice belongs to the picture,
 * the position belongs to the tile. No Y inversion: Unity inverts the row
 * because texture Y is bottom-up; CSS `background-position` is top-down
 * (docs/game-logic.md §2.2).
 */
export function tileSlideOffset(tile: Tile, geometry: BoardGeometry): Point {
  return {
    x: -tile.correctCell.x * geometry.cellSize,
    y: -tile.correctCell.y * geometry.cellSize,
  };
}

/** An absolutely-positioned rectangle in reference px, CSS conventions. */
export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where the square board sits inside its full-stretch parent.
 *
 * `ResizeBoardToSquare` centres the panel (anchor and pivot 0.5) and then offsets
 * it by `boardPanelPosition{Portrait|Landscape}`. Those are Unity values, so
 * **y is up**: portrait `y = 514` lifts the board 514 px above centre, which is
 * `top − 514` in CSS. This is the ONE place that conversion happens.
 */
export function boardRect(
  parentWidth: number,
  parentHeight: number,
  geometry: BoardGeometry,
  tuning: BoardTuning = BOARD_TUNING.portrait,
): Rect {
  const { boardSize } = geometry;
  return {
    left: parentWidth / 2 + tuning.panelOffset.x - boardSize / 2,
    top: parentHeight / 2 - tuning.panelOffset.y - boardSize / 2,
    width: boardSize,
    height: boardSize,
  };
}

/**
 * The white outline behind the tiles, in board-local px.
 *
 * `SetFullStretch(rt, tileSpacing)` sets `offsetMin = (−m, −m)` and
 * `offsetMax = (+m, +m)`, so the outline extends `tileSpacing` px **outward** on
 * every side — it is a border around the board, not an inset. With the scene's
 * `tileSpacing = 6` that is a 6 px overhang, and the visible frame between the
 * outer tiles and the board edge is exactly the tile gap.
 */
export function outlineRect(geometry: BoardGeometry): Rect {
  const margin = geometry.spacing;
  return {
    left: -margin,
    top: -margin,
    width: geometry.boardSize + margin * 2,
    height: geometry.boardSize + margin * 2,
  };
}

/**
 * Grid auto-sizing from the image aspect ratio.
 *
 * DISABLED in the shipping build (`isBoardSizePredefined = true`) and kept only
 * so re-enabling it stays a one-line change. The kiosk is fixed at 3×3
 * (docs/game-logic.md §1.1, docs/roadmap.md "out of scope").
 */
export function determineGridSize(imageWidth: number, imageHeight: number): GridSize {
  if (imageWidth > imageHeight) return { cols: 4, rows: 3 };
  if (imageHeight > imageWidth) return { cols: 3, rows: 4 };
  return { cols: 4, rows: 4 };
}

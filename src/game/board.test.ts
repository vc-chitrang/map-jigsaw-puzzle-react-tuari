import { describe, expect, it } from 'vitest';
import {
  BOARD_TUNING,
  GRID,
  boardRect,
  cellOrdinal,
  outlineRect,
  cellPosition,
  cellsEqual,
  computeBoardGeometry,
  createSolvedBoard,
  determineGridSize,
  isInsideGrid,
  isSolved,
  tileAt,
  tileSlideOffset,
} from './index';
import { cell } from './testing';

describe('createSolvedBoard', () => {
  const board = createSolvedBoard();

  it('creates 8 tiles for a 3×3 grid', () => {
    expect(board.tiles).toHaveLength(8);
  });

  it('leaves the bottom-right cell empty', () => {
    expect(board.emptyCell).toEqual({ x: 2, y: 2 });
  });

  it('indexes tiles row-major, skipping the empty cell', () => {
    // y = 0 is the TOP row.
    expect(board.tiles.map((t) => t.correctCell)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
    ]);
    expect(board.tiles.map((t) => t.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('starts every tile on its correct cell', () => {
    for (const tile of board.tiles) {
      expect(cellsEqual(tile.currentCell, tile.correctCell)).toBe(true);
    }
    expect(isSolved(board)).toBe(true);
  });

  it('has no tile in the empty cell', () => {
    expect(tileAt(board, board.emptyCell)).toBeUndefined();
  });

  it('scales to other grid sizes', () => {
    const wide = createSolvedBoard({ cols: 4, rows: 3 });
    expect(wide.tiles).toHaveLength(11);
    expect(wide.emptyCell).toEqual({ x: 3, y: 2 });
  });
});

describe('isInsideGrid', () => {
  it('accepts every in-range cell and rejects the rest', () => {
    expect(isInsideGrid(cell(0, 0), GRID)).toBe(true);
    expect(isInsideGrid(cell(2, 2), GRID)).toBe(true);
    expect(isInsideGrid(cell(-1, 0), GRID)).toBe(false);
    expect(isInsideGrid(cell(0, -1), GRID)).toBe(false);
    expect(isInsideGrid(cell(3, 0), GRID)).toBe(false);
    expect(isInsideGrid(cell(0, 3), GRID)).toBe(false);
  });
});

describe('cellOrdinal', () => {
  it('is row-major', () => {
    expect(cellOrdinal(cell(0, 0), GRID)).toBe(0);
    expect(cellOrdinal(cell(2, 0), GRID)).toBe(2);
    expect(cellOrdinal(cell(0, 1), GRID)).toBe(3);
    expect(cellOrdinal(cell(2, 2), GRID)).toBe(8);
  });
});

describe('BOARD_TUNING mirrors the scene-serialized GameManager values', () => {
  // These are the values Unity writes into the scene, which override the C#
  // field initialisers at runtime. docs/game-logic.md §11 listed the
  // initialisers; see the note at the top of constants.ts.
  it('portrait', () => {
    expect(BOARD_TUNING.portrait).toEqual({
      paddingFactor: 0.704,
      tileSpacing: 6,
      arrowSizeFactor: 0.35,
      shuffleMoveMultiplier: 1,
      panelOffset: { x: 0, y: 514 },
    });
  });

  it('landscape', () => {
    expect(BOARD_TUNING.landscape).toEqual({
      paddingFactor: 0.68,
      tileSpacing: 6,
      arrowSizeFactor: 0.35,
      shuffleMoveMultiplier: 1,
      panelOffset: { x: 0, y: 100 },
    });
  });
});

describe('computeBoardGeometry', () => {
  it('sizes the board from the shorter parent axis, at the tuned padding factor', () => {
    const geometry = computeBoardGeometry(2160, 3840);
    expect(geometry.boardSize).toBeCloseTo(2160 * 0.704, 10);
    expect(geometry.boardSize).toBeCloseTo(1520.64, 8);
  });

  it('is square regardless of which axis is shorter', () => {
    expect(computeBoardGeometry(3840, 2160).boardSize).toBeCloseTo(1520.64, 8);
  });

  it('derives cellSize as (board − spacing × (cols − 1)) / cols', () => {
    const { boardSize, cellSize, spacing } = computeBoardGeometry(2160, 3840);
    expect(spacing).toBe(6);
    expect(cellSize).toBeCloseTo((boardSize - 6 * 2) / 3, 10);
    // 1520.64 − 12 = 1508.64 / 3
    expect(cellSize).toBeCloseTo(502.88, 8);
  });

  it('leaves no leftover: 3 cells + 2 gaps == boardSize', () => {
    const { boardSize, cellSize, spacing } = computeBoardGeometry(1080, 1920);
    expect(cellSize * 3 + spacing * 2).toBeCloseTo(boardSize, 9);
  });

  it('uses the landscape padding factor when given the landscape tuning', () => {
    const geometry = computeBoardGeometry(3840, 2160, BOARD_TUNING.landscape);
    expect(geometry.boardSize).toBeCloseTo(2160 * 0.68, 10);
    expect(geometry.boardSize).toBeCloseTo(1468.8, 8);
  });
});

describe('boardRect', () => {
  const geometry = computeBoardGeometry(2160, 3840);

  it('centres the board horizontally', () => {
    const rect = boardRect(2160, 3840, geometry);
    expect(rect.left + rect.width / 2).toBeCloseTo(1080, 9);
  });

  it('lifts the board ABOVE centre — Unity y is up, CSS top decreases', () => {
    const rect = boardRect(2160, 3840, geometry);
    // panelOffset.y = 514 → centre at 1920 − 514 = 1406.
    expect(rect.top + rect.height / 2).toBeCloseTo(1406, 9);
    expect(rect.top).toBeCloseTo(1920 - 514 - geometry.boardSize / 2, 9);
    expect(rect.top).toBeCloseTo(645.68, 8);
  });

  it('is square', () => {
    const rect = boardRect(2160, 3840, geometry);
    expect(rect.width).toBe(rect.height);
    expect(rect.width).toBeCloseTo(geometry.boardSize, 10);
  });

  it('applies the landscape offset for the landscape build', () => {
    const landscapeGeometry = computeBoardGeometry(3840, 2160, BOARD_TUNING.landscape);
    const rect = boardRect(3840, 2160, landscapeGeometry, BOARD_TUNING.landscape);
    expect(rect.top + rect.height / 2).toBeCloseTo(1080 - 100, 9);
  });
});

describe('outlineRect', () => {
  const geometry = computeBoardGeometry(2160, 3840);

  it('extends OUTWARD by tileSpacing on all four sides', () => {
    // SetFullStretch(rt, margin) uses offsetMin = −margin, offsetMax = +margin.
    const rect = outlineRect(geometry);
    expect(rect.left).toBe(-6);
    expect(rect.top).toBe(-6);
    expect(rect.width).toBeCloseTo(geometry.boardSize + 12, 9);
    expect(rect.height).toBeCloseTo(geometry.boardSize + 12, 9);
  });

  it('stays centred on the board', () => {
    const rect = outlineRect(geometry);
    expect(rect.left + rect.width / 2).toBeCloseTo(geometry.boardSize / 2, 9);
  });
});

describe('cellPosition', () => {
  const geometry = computeBoardGeometry(2160, 3840);

  it('puts (0,0) at the board origin', () => {
    expect(cellPosition(cell(0, 0), geometry)).toEqual({ x: 0, y: 0 });
  });

  it('advances by cellSize + spacing per step, with y going DOWN', () => {
    const stride = geometry.cellSize + geometry.spacing;
    expect(cellPosition(cell(1, 0), geometry).x).toBeCloseTo(stride, 9);
    expect(cellPosition(cell(0, 1), geometry).y).toBeCloseTo(stride, 9);
    // No sign flip anywhere: row 2 is further down, i.e. larger y.
    expect(cellPosition(cell(0, 2), geometry).y).toBeGreaterThan(
      cellPosition(cell(0, 1), geometry).y,
    );
  });
});

describe('tileSlideOffset', () => {
  const geometry = computeBoardGeometry(2160, 3840);
  const board = createSolvedBoard();

  it('offsets by correctCell, negatively, with no Y inversion', () => {
    const bottomLeft = board.tiles.find((t) => t.index === 6);
    expect(bottomLeft).toBeDefined();
    const offset = tileSlideOffset(bottomLeft!, geometry);
    // correctCell (0,2): x = 0, y = −2 × cellSize
    expect(offset.x).toBe(-0);
    expect(offset.y).toBeCloseTo(-2 * geometry.cellSize, 9);
  });

  it('ignores currentCell — the slice belongs to the picture', () => {
    const tile = board.tiles[0]!;
    const moved = { ...tile, currentCell: cell(2, 2) };
    expect(tileSlideOffset(moved, geometry)).toEqual(tileSlideOffset(tile, geometry));
  });
});

describe('determineGridSize (auto-sizing, disabled in the shipping build)', () => {
  it('matches the documented aspect table', () => {
    expect(determineGridSize(1600, 900)).toEqual({ cols: 4, rows: 3 });
    expect(determineGridSize(900, 1600)).toEqual({ cols: 3, rows: 4 });
    expect(determineGridSize(1024, 1024)).toEqual({ cols: 4, rows: 4 });
  });
});

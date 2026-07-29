import { describe, expect, it } from 'vitest';
import {
  ARROW_DIRECTIONS,
  BOARD_TUNING,
  applyMove,
  areAdjacent,
  arrowPlacements,
  canMove,
  cellPosition,
  computeBoardGeometry,
  createSolvedBoard,
  isSolved,
  movableCells,
  tileAt,
} from './index';
import { cell } from './testing';

const board = createSolvedBoard();
const geometry = computeBoardGeometry(2160, 3840);

describe('areAdjacent', () => {
  it('is true only at Manhattan distance exactly 1', () => {
    expect(areAdjacent(cell(1, 1), cell(1, 0))).toBe(true);
    expect(areAdjacent(cell(1, 1), cell(1, 2))).toBe(true);
    expect(areAdjacent(cell(1, 1), cell(0, 1))).toBe(true);
    expect(areAdjacent(cell(1, 1), cell(2, 1))).toBe(true);
  });

  it('rejects the same cell, diagonals and distance 2', () => {
    expect(areAdjacent(cell(1, 1), cell(1, 1))).toBe(false);
    expect(areAdjacent(cell(1, 1), cell(0, 0))).toBe(false);
    expect(areAdjacent(cell(1, 1), cell(2, 2))).toBe(false);
    expect(areAdjacent(cell(0, 0), cell(2, 0))).toBe(false);
    expect(areAdjacent(cell(0, 0), cell(0, 2))).toBe(false);
  });
});

describe('movableCells', () => {
  it('returns only the empty cell’s in-grid neighbours', () => {
    // Empty starts bottom-right (2,2) → neighbours above (2,1) and left (1,2).
    expect(movableCells(board)).toEqual([
      { x: 2, y: 1 },
      { x: 1, y: 2 },
    ]);
  });

  it('returns all four for a centred empty cell', () => {
    const centred = applyMove(applyMove(board, cell(1, 2))!, cell(1, 1))!;
    expect(centred.emptyCell).toEqual({ x: 1, y: 1 });
    expect(movableCells(centred)).toHaveLength(4);
  });
});

describe('canMove / applyMove', () => {
  it('rejects non-adjacent, out-of-grid and empty-cell taps', () => {
    expect(canMove(board, cell(0, 0))).toBe(false); // far away
    expect(canMove(board, cell(2, 2))).toBe(false); // the empty cell itself
    expect(canMove(board, cell(3, 2))).toBe(false); // outside
    expect(applyMove(board, cell(0, 0))).toBeNull();
  });

  it('swaps the tile into the empty slot and moves the empty slot to its source', () => {
    const moved = applyMove(board, cell(2, 1));
    expect(moved).not.toBeNull();
    expect(moved!.emptyCell).toEqual({ x: 2, y: 1 });
    expect(tileAt(moved!, cell(2, 2))?.index).toBe(5); // tile from (2,1)
    expect(tileAt(moved!, cell(2, 1))).toBeUndefined();
  });

  it('does not mutate the input board', () => {
    const before = JSON.stringify(board);
    applyMove(board, cell(2, 1));
    expect(JSON.stringify(board)).toBe(before);
  });

  it('leaves the board solved-detectable after a move and its undo', () => {
    const moved = applyMove(board, cell(2, 1))!;
    expect(isSolved(moved)).toBe(false);
    const undone = applyMove(moved, cell(2, 2))!;
    expect(isSolved(undone)).toBe(true);
  });

  it('preserves tile count and never duplicates a cell', () => {
    let current = board;
    for (const target of [cell(1, 2), cell(1, 1), cell(0, 1), cell(0, 2)]) {
      current = applyMove(current, target)!;
      expect(current.tiles).toHaveLength(8);
      const occupied = new Set(current.tiles.map((t) => `${t.currentCell.x},${t.currentCell.y}`));
      expect(occupied.size).toBe(8);
      expect(occupied.has(`${current.emptyCell.x},${current.emptyCell.y}`)).toBe(false);
    }
  });
});

describe('ARROW_DIRECTIONS', () => {
  it('is in GameManager order (0,−1) (0,1) (−1,0) (1,0)', () => {
    expect(ARROW_DIRECTIONS.map((d) => d.offset)).toEqual([
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ]);
  });

  it('maps each offset to the normalised sprite name', () => {
    expect(ARROW_DIRECTIONS.map((d) => d.asset)).toEqual([
      'arrow-up.png',
      'arrow-down.png',
      'arrow-left.png',
      'arrow-right.png',
    ]);
  });
});

describe('arrowPlacements', () => {
  it('shows only arrows whose neighbour exists and holds a tile', () => {
    const placements = arrowPlacements(board, geometry);
    expect(placements.map((p) => p.asset)).toEqual(['arrow-up.png', 'arrow-left.png']);
  });

  it('shows all four when the empty cell is centred', () => {
    const centred = applyMove(applyMove(board, cell(1, 2))!, cell(1, 1))!;
    expect(arrowPlacements(centred, geometry)).toHaveLength(4);
  });

  it('sizes arrows at the tuned 35 % of the cell', () => {
    const [first] = arrowPlacements(board, geometry);
    expect(BOARD_TUNING.portrait.arrowSizeFactor).toBe(0.35);
    expect(first!.size).toBeCloseTo(geometry.cellSize * 0.35, 9);
  });

  it('centres each arrow on the edge between the empty cell and its neighbour', () => {
    const centred = applyMove(applyMove(board, cell(1, 2))!, cell(1, 1))!;
    const placements = arrowPlacements(centred, geometry);
    const emptyPos = cellPosition(centred.emptyCell, geometry);
    const half = (geometry.cellSize + geometry.spacing) / 2;
    const centre = { x: emptyPos.x + geometry.cellSize / 2, y: emptyPos.y + geometry.cellSize / 2 };

    for (const placement of placements) {
      const direction = ARROW_DIRECTIONS[placement.index]!;
      // Arrow CENTRE = empty centre + offset × half. Position is top-left.
      expect(placement.position.x + placement.size / 2).toBeCloseTo(
        centre.x + direction.offset.x * half,
        9,
      );
      expect(placement.position.y + placement.size / 2).toBeCloseTo(
        centre.y + direction.offset.y * half,
        9,
      );
    }
  });

  it('does NOT negate y — the up arrow sits above the empty cell', () => {
    const centred = applyMove(applyMove(board, cell(1, 2))!, cell(1, 1))!;
    const placements = arrowPlacements(centred, geometry);
    const up = placements.find((p) => p.asset === 'arrow-up.png')!;
    const down = placements.find((p) => p.asset === 'arrow-down.png')!;
    const emptyPos = cellPosition(centred.emptyCell, geometry);

    // Smaller y is higher on screen. This is the double-negation guard.
    expect(up.position.y).toBeLessThan(emptyPos.y);
    expect(down.position.y).toBeGreaterThan(emptyPos.y);
    expect(up.targetCell).toEqual({ x: 1, y: 0 });
    expect(down.targetCell).toEqual({ x: 1, y: 2 });
  });
});

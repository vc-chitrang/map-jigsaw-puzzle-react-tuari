import { describe, expect, it } from 'vitest';
import {
  clampGridInside,
  cornerPosition,
  fittedImageRect,
  gridBounds,
  gridSizeNormalised,
  gridToSourceRect,
  initialGrid,
  isQuarterTurn,
  moveGrid,
  normaliseRotation,
  oppositeCorner,
  resizeGridFromCorner,
  rotatedSize,
  type CornerIndex,
} from './cropGrid';

/** The crop stage is square in the portrait scene: 1520.64 reference px. */
const STAGE = { width: 1520.64, height: 1520.64 };
const MIN_FRACTION = 0.2;

describe('normaliseRotation', () => {
  it('wraps into [0, 360)', () => {
    expect(normaliseRotation(0)).toBe(0);
    expect(normaliseRotation(90)).toBe(90);
    expect(normaliseRotation(360)).toBe(0);
    expect(normaliseRotation(450)).toBe(90);
    expect(normaliseRotation(-90)).toBe(270);
    expect(normaliseRotation(-450)).toBe(270);
  });

  it('snaps to the nearest quarter turn', () => {
    expect(normaliseRotation(89)).toBe(90);
    expect(normaliseRotation(1)).toBe(0);
  });
});

describe('isQuarterTurn / rotatedSize', () => {
  it('swaps dimensions for 90 and 270 only', () => {
    expect(isQuarterTurn(0)).toBe(false);
    expect(isQuarterTurn(90)).toBe(true);
    expect(isQuarterTurn(180)).toBe(false);
    expect(isQuarterTurn(270)).toBe(true);

    const source = { width: 400, height: 300 };
    expect(rotatedSize(source, 0)).toEqual({ width: 400, height: 300 });
    expect(rotatedSize(source, 90)).toEqual({ width: 300, height: 400 });
    expect(rotatedSize(source, 180)).toEqual({ width: 400, height: 300 });
    expect(rotatedSize(source, 270)).toEqual({ width: 300, height: 400 });
  });
});

describe('fittedImageRect — Unity preserveAspect / object-fit: contain', () => {
  it('letterboxes a landscape image in a square stage', () => {
    const rect = fittedImageRect(STAGE, { width: 2000, height: 1000 });
    expect(rect.width).toBeCloseTo(1520.64, 6);
    expect(rect.height).toBeCloseTo(760.32, 6);
    expect(rect.x).toBeCloseTo(0, 6);
    expect(rect.y).toBeCloseTo(380.16, 6);
  });

  it('pillarboxes a portrait image', () => {
    const rect = fittedImageRect(STAGE, { width: 1000, height: 2000 });
    expect(rect.width).toBeCloseTo(760.32, 6);
    expect(rect.height).toBeCloseTo(1520.64, 6);
    expect(rect.x).toBeCloseTo(380.16, 6);
    expect(rect.y).toBeCloseTo(0, 6);
  });

  it('fills a square image exactly', () => {
    const rect = fittedImageRect(STAGE, { width: 1024, height: 1024 });
    expect(rect).toEqual({ x: 0, y: 0, width: 1520.64, height: 1520.64 });
  });

  it('accounts for rotation — a rotated landscape becomes portrait', () => {
    const rect = fittedImageRect(STAGE, { width: 2000, height: 1000 }, 90);
    expect(rect.width).toBeCloseTo(760.32, 6);
    expect(rect.height).toBeCloseTo(1520.64, 6);
  });

  it('returns an empty rect for a degenerate input instead of NaN', () => {
    expect(fittedImageRect(STAGE, { width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });
});

describe('gridBounds / initialGrid', () => {
  const visible = fittedImageRect(STAGE, { width: 2000, height: 1000 });

  it('starts at the largest square that fits the VISIBLE image', () => {
    const bounds = gridBounds(visible, MIN_FRACTION);
    // The visible image is 1520.64 x 760.32, so the square is limited by height.
    expect(bounds.initialSize).toBeCloseTo(760.32, 6);
    expect(bounds.minSize).toBeCloseTo(760.32 * 0.2, 6);
  });

  it('centres the initial grid on the visible image', () => {
    const grid = initialGrid(visible, MIN_FRACTION);
    expect(grid.width).toBe(grid.height);
    expect(grid.x + grid.width / 2).toBeCloseTo(visible.x + visible.width / 2, 6);
    expect(grid.y + grid.height / 2).toBeCloseTo(visible.y + visible.height / 2, 6);
  });

  it('is inside the visible image', () => {
    const grid = initialGrid(visible, MIN_FRACTION);
    expect(grid.x).toBeGreaterThanOrEqual(visible.x - 1e-9);
    expect(grid.y).toBeGreaterThanOrEqual(visible.y - 1e-9);
    expect(grid.x + grid.width).toBeLessThanOrEqual(visible.x + visible.width + 1e-9);
    expect(grid.y + grid.height).toBeLessThanOrEqual(visible.y + visible.height + 1e-9);
  });
});

describe('clampGridInside', () => {
  const visible = { x: 100, y: 200, width: 800, height: 600 };

  it('pulls a grid back inside on both axes', () => {
    const clamped = clampGridInside({ x: -50, y: -50, width: 200, height: 200 }, visible);
    expect(clamped.x).toBe(100);
    expect(clamped.y).toBe(200);
  });

  it('stops a grid running off the far edge', () => {
    const clamped = clampGridInside({ x: 5000, y: 5000, width: 200, height: 200 }, visible);
    expect(clamped.x).toBe(100 + 800 - 200);
    expect(clamped.y).toBe(200 + 600 - 200);
  });

  it('centres a grid larger than the visible area rather than shoving it off', () => {
    // max < min here, so a naive clamp would produce nonsense.
    const clamped = clampGridInside({ x: 0, y: 0, width: 1000, height: 1000 }, visible);
    expect(clamped.x).toBeCloseTo(100 + (800 - 1000) / 2, 6);
    expect(clamped.y).toBeCloseTo(200 + (600 - 1000) / 2, 6);
  });

  it('leaves an already-inside grid untouched', () => {
    const grid = { x: 300, y: 300, width: 200, height: 200 };
    expect(clampGridInside(grid, visible)).toEqual(grid);
  });
});

describe('moveGrid', () => {
  const visible = { x: 0, y: 0, width: 1000, height: 1000 };
  const grid = { x: 400, y: 400, width: 200, height: 200 };

  it('applies the delta', () => {
    expect(moveGrid(grid, 50, -30, visible)).toMatchObject({ x: 450, y: 370 });
  });

  it('clamps at the edges', () => {
    expect(moveGrid(grid, -9999, -9999, visible)).toMatchObject({ x: 0, y: 0 });
    expect(moveGrid(grid, 9999, 9999, visible)).toMatchObject({ x: 800, y: 800 });
  });

  it('never changes the size', () => {
    const moved = moveGrid(grid, 123, 456, visible);
    expect(moved.width).toBe(grid.width);
    expect(moved.height).toBe(grid.height);
  });
});

describe('oppositeCorner / cornerPosition', () => {
  it('opposes corners as (index + 2) % 4 — Unity order BL, TL, TR, BR', () => {
    expect(oppositeCorner(0)).toBe(2);
    expect(oppositeCorner(1)).toBe(3);
    expect(oppositeCorner(2)).toBe(0);
    expect(oppositeCorner(3)).toBe(1);
  });

  it('places corners in CSS space, y down', () => {
    const grid = { x: 10, y: 20, width: 100, height: 100 };
    expect(cornerPosition(grid, 0)).toEqual({ x: 10, y: 120 }); // bottom-left
    expect(cornerPosition(grid, 1)).toEqual({ x: 10, y: 20 }); // top-left
    expect(cornerPosition(grid, 2)).toEqual({ x: 110, y: 20 }); // top-right
    expect(cornerPosition(grid, 3)).toEqual({ x: 110, y: 120 }); // bottom-right
  });
});

describe('resizeGridFromCorner', () => {
  const visible = { x: 0, y: 0, width: 1000, height: 1000 };
  const bounds = { initialSize: 800, minSize: 160 };
  const grid = { x: 100, y: 100, width: 400, height: 400 };

  it('stays square', () => {
    for (const corner of [0, 1, 2, 3] as CornerIndex[]) {
      const resized = resizeGridFromCorner(grid, corner, 40, 40, visible, bounds);
      expect(resized.width).toBeCloseTo(resized.height, 9);
    }
  });

  it('grows when dragged outward and shrinks when dragged inward', () => {
    // Corner 3 is bottom-right; its outward diagonal is (+1, +1).
    const grown = resizeGridFromCorner(grid, 3, 50, 50, visible, bounds);
    expect(grown.width).toBeGreaterThan(grid.width);

    const shrunk = resizeGridFromCorner(grid, 3, -50, -50, visible, bounds);
    expect(shrunk.width).toBeLessThan(grid.width);
  });

  it('keeps the OPPOSITE corner fixed', () => {
    const corner: CornerIndex = 3; // bottom-right; top-left must not move
    const resized = resizeGridFromCorner(grid, corner, 60, 60, visible, bounds);
    const before = cornerPosition(grid, oppositeCorner(corner));
    const after = cornerPosition(resized, oppositeCorner(corner));
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('keeps the opposite corner fixed for the top-left handle too', () => {
    const corner: CornerIndex = 1; // top-left; bottom-right must not move
    const resized = resizeGridFromCorner(grid, corner, -60, -60, visible, bounds);
    const before = cornerPosition(grid, oppositeCorner(corner));
    const after = cornerPosition(resized, oppositeCorner(corner));
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('ignores movement across the diagonal', () => {
    // (+1,−1) is perpendicular to corner 3's (+1,+1) diagonal, so it projects to 0.
    const resized = resizeGridFromCorner(grid, 3, 50, -50, visible, bounds);
    expect(resized.width).toBeCloseTo(grid.width, 6);
  });

  it('clamps to minSize and initialSize', () => {
    expect(resizeGridFromCorner(grid, 3, 99999, 99999, visible, bounds).width).toBeCloseTo(
      bounds.initialSize,
      6,
    );
    expect(resizeGridFromCorner(grid, 3, -99999, -99999, visible, bounds).width).toBeCloseTo(
      bounds.minSize,
      6,
    );
  });

  it('keeps the result inside the visible image', () => {
    const resized = resizeGridFromCorner(grid, 3, 99999, 99999, visible, bounds);
    expect(resized.x).toBeGreaterThanOrEqual(0);
    expect(resized.y).toBeGreaterThanOrEqual(0);
    expect(resized.x + resized.width).toBeLessThanOrEqual(visible.width + 1e-6);
    expect(resized.y + resized.height).toBeLessThanOrEqual(visible.height + 1e-6);
  });
});

describe('gridSizeNormalised', () => {
  it('maps min to 0 and initial to 1', () => {
    const bounds = { initialSize: 800, minSize: 160 };
    expect(gridSizeNormalised({ x: 0, y: 0, width: 160, height: 160 }, bounds)).toBeCloseTo(0, 9);
    expect(gridSizeNormalised({ x: 0, y: 0, width: 800, height: 800 }, bounds)).toBeCloseTo(1, 9);
    expect(gridSizeNormalised({ x: 0, y: 0, width: 480, height: 480 }, bounds)).toBeCloseTo(0.5, 9);
  });

  it('returns 1 for a degenerate span rather than dividing by zero', () => {
    expect(gridSizeNormalised({ x: 0, y: 0, width: 5, height: 5 }, { initialSize: 5, minSize: 5 })).toBe(1);
  });
});

describe('gridToSourceRect', () => {
  const source = { width: 2000, height: 1000 };
  const visible = fittedImageRect(STAGE, source); // 1520.64 x 760.32 at y = 380.16

  it('maps the full visible area to the full source', () => {
    const region = gridToSourceRect(visible, visible, source, 0);
    expect(region.x).toBeCloseTo(0, 6);
    expect(region.y).toBeCloseTo(0, 6);
    expect(region.width).toBeCloseTo(2000, 6);
    expect(region.height).toBeCloseTo(1000, 6);
  });

  it('scales a centred square to source pixels', () => {
    const grid = initialGrid(visible, MIN_FRACTION); // 760.32 square
    const region = gridToSourceRect(grid, visible, source, 0);
    // 760.32 display px is half the visible width, i.e. 1000 source px.
    expect(region.width).toBeCloseTo(1000, 4);
    expect(region.height).toBeCloseTo(1000, 4);
    expect(region.x).toBeCloseTo(500, 4);
    expect(region.y).toBeCloseTo(0, 4);
  });

  it('uses the ROTATED dimensions', () => {
    const rotatedVisible = fittedImageRect(STAGE, source, 90);
    const region = gridToSourceRect(rotatedVisible, rotatedVisible, source, 90);
    // After a quarter turn the image is 1000 x 2000.
    expect(region.width).toBeCloseTo(1000, 6);
    expect(region.height).toBeCloseTo(2000, 6);
  });

  it('never asks for pixels outside the image', () => {
    const outside = { x: -5000, y: -5000, width: 99999, height: 99999 };
    const region = gridToSourceRect(outside, visible, source, 0);
    expect(region.x).toBeGreaterThanOrEqual(0);
    expect(region.y).toBeGreaterThanOrEqual(0);
    expect(region.x + region.width).toBeLessThanOrEqual(source.width);
    expect(region.y + region.height).toBeLessThanOrEqual(source.height);
  });

  it('returns an empty rect when the visible area is degenerate', () => {
    const region = gridToSourceRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 0, y: 0, width: 0, height: 0 },
      source,
      0,
    );
    expect(region).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

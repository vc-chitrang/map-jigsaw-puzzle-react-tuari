/**
 * Crop-grid maths — pure, no DOM.
 *
 * Ports `CropGridResizer`: a SQUARE grid over a fitted image, resizable by four
 * corner handles and movable by dragging its body, always clamped inside the
 * visible image.
 *
 *   * The grid starts at the largest square that fits the visible image, centred.
 *   * A corner drag resizes about the OPPOSITE corner, so that corner stays put.
 *   * Size is clamped to `[minSizeFraction × initial, initial]`.
 *   * Position is clamped so the grid never leaves the visible image.
 *
 * Rotation is a multiple of 90°, so a rotated image still presents an
 * axis-aligned rectangle and the same maths applies to its swapped dimensions.
 */

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Unity corner order: bottom-left, top-left, top-right, bottom-right. */
export type CornerIndex = 0 | 1 | 2 | 3;

export const CORNER_COUNT = 4;

/** Rotation in degrees, always a multiple of 90 and normalised to [0, 360). */
export type Rotation = 0 | 90 | 180 | 270;

export function normaliseRotation(degrees: number): Rotation {
  const wrapped = ((Math.round(degrees / 90) * 90) % 360 + 360) % 360;
  return wrapped as Rotation;
}

/** True when a rotation swaps width and height. */
export function isQuarterTurn(rotation: Rotation): boolean {
  return rotation === 90 || rotation === 270;
}

/** Source dimensions as they appear after rotation. */
export function rotatedSize(source: Size, rotation: Rotation): Size {
  return isQuarterTurn(rotation)
    ? { width: source.height, height: source.width }
    : { width: source.width, height: source.height };
}

/**
 * Where a `contain`-fitted image actually lands inside the stage.
 *
 * Unity `preserveAspect` letterboxes exactly like `object-fit: contain`, so the
 * *visible* image is usually smaller than the stage — and the grid is clamped to
 * the visible image, not to the stage.
 */
export function fittedImageRect(stage: Size, source: Size, rotation: Rotation = 0): Rect {
  const rotated = rotatedSize(source, rotation);
  if (rotated.width <= 0 || rotated.height <= 0 || stage.width <= 0 || stage.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const scale = Math.min(stage.width / rotated.width, stage.height / rotated.height);
  const width = rotated.width * scale;
  const height = rotated.height * scale;

  return {
    x: (stage.width - width) / 2,
    y: (stage.height - height) / 2,
    width,
    height,
  };
}

export interface GridBounds {
  /** Largest square that fits the visible image. */
  readonly initialSize: number;
  readonly minSize: number;
}

export function gridBounds(visible: Rect, minSizeFraction: number): GridBounds {
  const initialSize = Math.min(visible.width, visible.height);
  return { initialSize, minSize: initialSize * minSizeFraction };
}

/** Centred square grid at its initial size. */
export function initialGrid(visible: Rect, minSizeFraction: number): Rect {
  const { initialSize } = gridBounds(visible, minSizeFraction);
  return {
    x: visible.x + (visible.width - initialSize) / 2,
    y: visible.y + (visible.height - initialSize) / 2,
    width: initialSize,
    height: initialSize,
  };
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * Keep the grid fully inside the visible image.
 *
 * If the grid is somehow larger than the visible area on an axis, it is centred
 * on that axis rather than pushed off-screen — `max` would otherwise fall below
 * `min` and the clamp would produce a nonsensical position.
 */
export function clampGridInside(grid: Rect, visible: Rect): Rect {
  const maxX = visible.x + visible.width - grid.width;
  const maxY = visible.y + visible.height - grid.height;

  return {
    ...grid,
    x:
      maxX < visible.x
        ? visible.x + (visible.width - grid.width) / 2
        : clamp(grid.x, visible.x, maxX),
    y:
      maxY < visible.y
        ? visible.y + (visible.height - grid.height) / 2
        : clamp(grid.y, visible.y, maxY),
  };
}

/** Move the grid by a pointer delta, clamped. */
export function moveGrid(grid: Rect, deltaX: number, deltaY: number, visible: Rect): Rect {
  return clampGridInside({ ...grid, x: grid.x + deltaX, y: grid.y + deltaY }, visible);
}

/**
 * Which corner of the grid stays fixed when `corner` is dragged.
 * Unity order: 0 BL, 1 TL, 2 TR, 3 BR — so the opposite is `(index + 2) % 4`.
 */
export function oppositeCorner(corner: CornerIndex): CornerIndex {
  return ((corner + 2) % CORNER_COUNT) as CornerIndex;
}

/** Position of a grid corner, in stage coordinates (y down). */
export function cornerPosition(grid: Rect, corner: CornerIndex): { x: number; y: number } {
  switch (corner) {
    case 0:
      return { x: grid.x, y: grid.y + grid.height };
    case 1:
      return { x: grid.x, y: grid.y };
    case 2:
      return { x: grid.x + grid.width, y: grid.y };
    default:
      return { x: grid.x + grid.width, y: grid.y + grid.height };
  }
}

/**
 * Outward diagonal for each corner, in CSS coordinates (y DOWN).
 *
 * Unity's array is in its own y-up space; these are the same directions expressed
 * for a downward y axis, so dragging a corner away from the centre always grows
 * the grid.
 */
const DIAGONALS: readonly { x: number; y: number }[] = [
  { x: -1, y: 1 }, // 0 bottom-left
  { x: -1, y: -1 }, // 1 top-left
  { x: 1, y: -1 }, // 2 top-right
  { x: 1, y: 1 }, // 3 bottom-right
];

/**
 * Resize from a corner drag.
 *
 * The pointer delta is projected onto the corner's outward diagonal, so movement
 * along the diagonal resizes and movement across it is ignored — which is what
 * keeps the grid square without the pointer having to track a corner exactly.
 */
export function resizeGridFromCorner(
  grid: Rect,
  corner: CornerIndex,
  deltaX: number,
  deltaY: number,
  visible: Rect,
  bounds: GridBounds,
): Rect {
  const diagonal = DIAGONALS[corner];
  if (!diagonal) return grid;

  // Normalise the diagonal (both components are ±1, so length is √2).
  const length = Math.SQRT2;
  const projected = (deltaX * diagonal.x + deltaY * diagonal.y) / length;

  const nextSize = clamp(grid.width + projected, bounds.minSize, bounds.initialSize);

  // Anchor the opposite corner so it does not move.
  const fixed = cornerPosition(grid, oppositeCorner(corner));
  const growsRight = diagonal.x > 0;
  const growsDown = diagonal.y > 0;

  const resized: Rect = {
    x: growsRight ? fixed.x : fixed.x - nextSize,
    y: growsDown ? fixed.y : fixed.y - nextSize,
    width: nextSize,
    height: nextSize,
  };

  return clampGridInside(resized, visible);
}

/** Grid size as a 0..1 value between min and initial — the old zoom-slider scale. */
export function gridSizeNormalised(grid: Rect, bounds: GridBounds): number {
  const span = bounds.initialSize - bounds.minSize;
  if (span <= 0) return 1;
  return clamp((grid.width - bounds.minSize) / span, 0, 1);
}

/**
 * Map the grid rectangle from stage space to SOURCE pixels.
 *
 * `visible` is where the rotated image is drawn, so the ratio between the two is
 * the display scale. The result is expressed in the rotated image's coordinate
 * space, which is what the export canvas draws into.
 */
export function gridToSourceRect(grid: Rect, visible: Rect, source: Size, rotation: Rotation): Rect {
  const rotated = rotatedSize(source, rotation);
  if (visible.width <= 0 || visible.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const scaleX = rotated.width / visible.width;
  const scaleY = rotated.height / visible.height;

  const x = (grid.x - visible.x) * scaleX;
  const y = (grid.y - visible.y) * scaleY;
  const width = grid.width * scaleX;
  const height = grid.height * scaleY;

  // Clamp into the image: rounding at the edges must never ask for pixels that
  // do not exist, which is the same class of bug the Unity slicing code hit.
  const clampedX = clamp(x, 0, Math.max(0, rotated.width - 1));
  const clampedY = clamp(y, 0, Math.max(0, rotated.height - 1));

  return {
    x: clampedX,
    y: clampedY,
    width: clamp(width, 1, rotated.width - clampedX),
    height: clamp(height, 1, rotated.height - clampedY),
  };
}

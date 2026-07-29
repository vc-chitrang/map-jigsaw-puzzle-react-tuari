/**
 * RectTransform → CSS, in one place.
 *
 * Unity `RectTransform` values appear in exactly two shapes in these scenes
 * (docs/ui-spec.md §2). Geometry is stored as DATA in the per-orientation tables
 * and converted here, so:
 *
 *   * values stay byte-identical to `docs/ui/scene-portrait.md` and remain
 *     diffable against Unity after a scene change, and
 *   * the Y flip and the pivot correction exist exactly once.
 *
 * Everything is expressed as percentages of the parent plus a px delta, so the
 * conversion never needs to know the parent's pixel size.
 */

import type { CSSProperties } from 'react';

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** `anchorMin = (0,0)`, `anchorMax = (1,1)`. */
export interface StretchRect {
  readonly kind: 'stretch';
  /**
   * Unity `sizeDelta`. A NEGATIVE component means "stretch minus this many px,
   * total, split across both edges" (e.g. `(0, −1680)` → 840 px off top and
   * bottom). Positive components are not meaningful for a stretched rect.
   */
  readonly size?: Vec2;
}

/** `anchorMin ≠ anchorMax`, `size = (0,0)` — percentage layout. */
export interface FractionalRect {
  readonly kind: 'fractional';
  readonly anchorMin: Vec2;
  readonly anchorMax: Vec2;
}

/** `anchorMin == anchorMax` — a point, with an explicit size and pivot. */
export interface PointRect {
  readonly kind: 'point';
  readonly anchor: Vec2;
  readonly pos: Vec2;
  readonly size: Vec2;
  readonly pivot: Vec2;
}

/** Anchored to one parent EDGE: `anchorMin.x ≠ anchorMax.x` but the Y is a point. */
export interface HorizontalBandRect {
  readonly kind: 'horizontalBand';
  /** Shared anchor Y (0 = bottom, 1 = top). */
  readonly anchorY: number;
  readonly anchorMinX: number;
  readonly anchorMaxX: number;
  readonly pos: Vec2;
  /** Only `y` is used; width comes from the anchors. */
  readonly size: Vec2;
  readonly pivot: Vec2;
}

export type LayoutRect = StretchRect | FractionalRect | PointRect | HorizontalBandRect;

const pct = (value: number): string => `${(value * 100).toFixed(4)}%`;

/**
 * Trim binary-float noise from a px value.
 *
 * Scene values have at most four decimals (`pos.y = −593.5649`), but arithmetic on
 * them produces things like `496.56489999999997`. Four decimals is well below one
 * device pixel at every tested resolution and keeps the generated CSS — and the
 * tests that assert on it — stable.
 */
function px(value: number): string {
  return `${Number(value.toFixed(4))}px`;
}

/**
 * Combine a percentage and a px offset into a `calc()`, skipping the arithmetic
 * when one side is zero so the generated CSS stays readable in DevTools.
 */
function offset(percent: number, value: number): string {
  if (value === 0) return pct(percent);
  if (percent === 0) return px(value);
  return `calc(${pct(percent)} ${value < 0 ? '-' : '+'} ${px(Math.abs(value))})`;
}

/**
 * Absolute-position styles for a rect.
 *
 * Y RULES (docs/pixel-perfect-replication.md §2):
 *   * `cssTop% = (1 − anchorMax.y) × 100`
 *   * a Unity `pos.y` of +60 moves UP, so it SUBTRACTS from `top`
 *   * the element's own `pivot` sits on the anchor, so shift by `−pivot.x × w`
 *     horizontally and `−(1 − pivot.y) × h` vertically
 */
export function rectStyle(rect: LayoutRect): CSSProperties {
  switch (rect.kind) {
    case 'stretch': {
      const size = rect.size ?? { x: 0, y: 0 };
      // Negative sizeDelta = inset by half on each edge (pivot 0.5).
      const insetX = size.x < 0 ? -size.x / 2 : 0;
      const insetY = size.y < 0 ? -size.y / 2 : 0;
      return {
        position: 'absolute',
        left: px(insetX),
        right: px(insetX),
        top: px(insetY),
        bottom: px(insetY),
      };
    }

    case 'fractional': {
      return {
        position: 'absolute',
        left: pct(rect.anchorMin.x),
        width: pct(rect.anchorMax.x - rect.anchorMin.x),
        top: pct(1 - rect.anchorMax.y),
        height: pct(rect.anchorMax.y - rect.anchorMin.y),
      };
    }

    case 'point': {
      const { anchor, pos, size, pivot } = rect;
      return {
        position: 'absolute',
        left: offset(anchor.x, pos.x - pivot.x * size.x),
        top: offset(1 - anchor.y, -pos.y - (1 - pivot.y) * size.y),
        width: px(size.x),
        height: px(size.y),
      };
    }

    case 'horizontalBand': {
      const { anchorY, anchorMinX, anchorMaxX, pos, size, pivot } = rect;
      return {
        position: 'absolute',
        left: offset(anchorMinX, pos.x),
        width: pct(anchorMaxX - anchorMinX),
        top: offset(1 - anchorY, -pos.y - (1 - pivot.y) * size.y),
        height: px(size.y),
      };
    }

    default: {
      const unreachable: never = rect;
      return unreachable;
    }
  }
}

/** TMP `m_margin`, `(left, top, right, bottom)` in reference px. */
export interface TextMarginPx {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface TextLike {
  readonly fontSizePx: number;
  readonly colour: string;
  readonly marginPx?: TextMarginPx;
}

/**
 * Font size, colour and TMP margins for a text element.
 *
 * TMP centres text inside the rect MINUS `m_margin`, which is exactly what CSS
 * padding does to a centred flex box. The footer labels depend on this: `RESET`
 * carries a 90 px left margin that shifts it clear of its icon, and dropping the
 * margins makes label and icon overlap.
 */
export function textStyle(spec: TextLike): CSSProperties {
  const margin = spec.marginPx;
  return {
    fontSize: `${spec.fontSizePx}px`,
    color: spec.colour,
    ...(margin
      ? {
          paddingLeft: `${margin.left}px`,
          paddingTop: `${margin.top}px`,
          paddingRight: `${margin.right}px`,
          paddingBottom: `${margin.bottom}px`,
        }
      : {}),
  };
}

/**
 * A zero-sized text object (`sizeDelta = (0,0)` on a point anchor) renders in TMP
 * as text growing symmetrically around the anchor. In CSS the box collapses, so
 * the label is centred on it with its own transform instead.
 */
export const CENTRED_ON_POINT: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  transform: 'translate(-50%, -50%)',
  whiteSpace: 'nowrap',
};

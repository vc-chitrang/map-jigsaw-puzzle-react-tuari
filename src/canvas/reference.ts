/**
 * Canvas reference resolutions and the Unity CanvasScaler scale factor.
 *
 * Unity does not lay out in device pixels: it lays out at a fixed reference
 * resolution and multiplies the whole canvas by one uniform factor.
 *
 *   UI Scale Mode      : ScaleWithScreenSize
 *   Screen Match Mode  : MatchWidthOrHeight
 *   match              : 0.5
 *
 * With match = 0.5 the logarithmic blend collapses to the geometric mean of the
 * two axis ratios — see docs/pixel-perfect-replication.md §1.
 *
 * Pure module: no React, no DOM. Unit-tested in reference.test.ts.
 */

import type { Orientation } from '../game/types';

export type { Orientation };

export interface ReferenceSize {
  readonly w: number;
  readonly h: number;
}

export const REFERENCE: Record<Orientation, ReferenceSize> = {
  portrait: { w: 2160, h: 3840 },
  landscape: { w: 3840, h: 2160 },
};

/** Unity CanvasScaler `matchWidthOrHeight`. Both scenes ship 0.5. */
export const MATCH = 0.5;

/**
 * Unity's exact CanvasScaler maths (ScaleWithScreenSize + MatchWidthOrHeight).
 *
 *   logWidth    = log2(screenW / refW)
 *   logHeight   = log2(screenH / refH)
 *   logWeighted = lerp(logWidth, logHeight, match)
 *   scaleFactor = 2 ^ logWeighted
 *
 * Kept in the general (any `match`) form so the second, "Expand" canvas and any
 * future match change stay one argument away instead of a rewrite.
 */
export function computeScaleFactor(
  screenW: number,
  screenH: number,
  reference: ReferenceSize,
  match: number = MATCH,
): number {
  // A zero/negative viewport happens transiently (minimise, pre-layout). Unity
  // would produce -Infinity here; clamp to 0 so callers never emit NaN CSS.
  if (screenW <= 0 || screenH <= 0) return 0;

  const logWidth = Math.log2(screenW / reference.w);
  const logHeight = Math.log2(screenH / reference.h);
  const logWeighted = logWidth + (logHeight - logWidth) * match;
  return Math.pow(2, logWeighted);
}

/**
 * The "Expand" canvas variant (`matchMode = 2`, match 0) used by the overlay
 * canvas in both scenes: never crops, so it takes the smaller ratio.
 */
export function computeExpandScaleFactor(
  screenW: number,
  screenH: number,
  reference: ReferenceSize,
): number {
  if (screenW <= 0 || screenH <= 0) return 0;
  return Math.min(screenW / reference.w, screenH / reference.h);
}

/**
 * Active orientation. Portrait is the primary kiosk build (2160×3840);
 * landscape lands in Phase 6. Driven by build config, never by a media query,
 * so the two builds stay explicit and diffable (docs/architecture.md §2.6).
 */
export function resolveOrientation(raw: string | undefined): Orientation {
  return raw === 'landscape' ? 'landscape' : 'portrait';
}

export const ORIENTATION: Orientation = resolveOrientation(
  import.meta.env.VITE_ORIENTATION as string | undefined,
);

export const REF: ReferenceSize = REFERENCE[ORIENTATION];

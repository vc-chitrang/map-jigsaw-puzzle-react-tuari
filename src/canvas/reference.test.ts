import { describe, expect, it } from 'vitest';
import {
  computeExpandScaleFactor,
  computeScaleFactor,
  MATCH,
  REFERENCE,
  resolveOrientation,
} from './reference';

const PORTRAIT = REFERENCE.portrait;

describe('computeScaleFactor (Unity CanvasScaler, match = 0.5)', () => {
  it('is exactly 1 at the reference resolution', () => {
    expect(computeScaleFactor(2160, 3840, PORTRAIT)).toBe(1);
  });

  it('equals the geometric mean of the two axis ratios', () => {
    // The closed form documented in pixel-perfect-replication.md §1:
    //   scale = sqrt((sw/rw) * (sh/rh))
    const cases: Array<[number, number]> = [
      [1080, 1920], // half 4K portrait
      [1440, 2560],
      [2160, 3840],
      [3840, 2160], // landscape display running the portrait build
      [1920, 1080],
      [1234, 987], // arbitrary, non-proportional
    ];

    for (const [w, h] of cases) {
      const expected = Math.sqrt((w / PORTRAIT.w) * (h / PORTRAIT.h));
      expect(computeScaleFactor(w, h, PORTRAIT)).toBeCloseTo(expected, 12);
    }
  });

  it('is 0.5 at half the reference resolution on both axes', () => {
    expect(computeScaleFactor(1080, 1920, PORTRAIT)).toBeCloseTo(0.5, 12);
  });

  it('reduces to the width ratio when match = 0', () => {
    expect(computeScaleFactor(1080, 3840, PORTRAIT, 0)).toBeCloseTo(0.5, 12);
  });

  it('reduces to the height ratio when match = 1', () => {
    expect(computeScaleFactor(2160, 1920, PORTRAIT, 1)).toBeCloseTo(0.5, 12);
  });

  it('uses match = 0.5 by default', () => {
    expect(MATCH).toBe(0.5);
    expect(computeScaleFactor(1080, 3840, PORTRAIT)).toBeCloseTo(
      computeScaleFactor(1080, 3840, PORTRAIT, 0.5),
      12,
    );
  });

  it('returns 0 for a degenerate viewport instead of NaN/-Infinity', () => {
    expect(computeScaleFactor(0, 1920, PORTRAIT)).toBe(0);
    expect(computeScaleFactor(1080, 0, PORTRAIT)).toBe(0);
    expect(computeScaleFactor(-1, -1, PORTRAIT)).toBe(0);
  });

  it('scales the landscape reference independently', () => {
    expect(computeScaleFactor(3840, 2160, REFERENCE.landscape)).toBe(1);
    expect(computeScaleFactor(1920, 1080, REFERENCE.landscape)).toBeCloseTo(0.5, 12);
  });
});

describe('computeExpandScaleFactor (overlay canvas, matchMode = Expand)', () => {
  it('takes the smaller ratio so content never crops', () => {
    expect(computeExpandScaleFactor(1080, 3840, PORTRAIT)).toBeCloseTo(0.5, 12);
    expect(computeExpandScaleFactor(2160, 1920, PORTRAIT)).toBeCloseTo(0.5, 12);
    expect(computeExpandScaleFactor(2160, 3840, PORTRAIT)).toBe(1);
  });
});

describe('resolveOrientation', () => {
  it('defaults to portrait — the primary kiosk build', () => {
    expect(resolveOrientation(undefined)).toBe('portrait');
    expect(resolveOrientation('')).toBe('portrait');
    expect(resolveOrientation('nonsense')).toBe('portrait');
  });

  it('honours an explicit landscape flag', () => {
    expect(resolveOrientation('landscape')).toBe('landscape');
  });
});

describe('reference resolutions match the Unity scenes', () => {
  it('portrait is 2160×3840', () => {
    expect(PORTRAIT).toEqual({ w: 2160, h: 3840 });
  });

  it('landscape is 3840×2160', () => {
    expect(REFERENCE.landscape).toEqual({ w: 3840, h: 2160 });
  });
});

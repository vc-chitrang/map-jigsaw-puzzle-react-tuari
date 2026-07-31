import { describe, expect, it } from 'vitest';
import { TAP_SLOP_PX, isTap } from './pointer';

/** Carried over from the deleted keyboard suite — the rule outlived the keyboard. */
describe('isTap — the 15 px dismiss rule (HandleKeyboardDismiss, ui-spec §5)', () => {
  it('uses a 15 px threshold', () => {
    expect(TAP_SLOP_PX).toBe(15);
  });

  it('counts no movement as a tap', () => {
    expect(isTap(100, 100, 100, 100)).toBe(true);
  });

  it('counts small movement as a tap', () => {
    expect(isTap(100, 100, 110, 100)).toBe(true);
    expect(isTap(100, 100, 100, 114)).toBe(true);
  });

  it('counts a drag as NOT a tap, so scrolling the grid does not dismiss', () => {
    expect(isTap(100, 100, 100, 200)).toBe(false);
    expect(isTap(100, 100, 140, 100)).toBe(false);
  });

  it('measures diagonally, not per-axis', () => {
    // 11 px on each axis is under the threshold per-axis but 15.6 px diagonally.
    expect(isTap(0, 0, 11, 11)).toBe(false);
    expect(isTap(0, 0, 10, 10)).toBe(true);
  });

  it('is direction-agnostic', () => {
    expect(isTap(100, 100, 60, 100)).toBe(false);
    expect(isTap(100, 100, 95, 95)).toBe(true);
  });
});

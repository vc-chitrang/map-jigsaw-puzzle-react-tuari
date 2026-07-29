import { describe, expect, it } from 'vitest';
import { INITIAL_TIMER, NO_HIGH_SCORE, formatTime, tickTimer } from './index';

describe('formatTime', () => {
  it('renders mm:ss, zero-padded and floored', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(9)).toBe('00:09');
    expect(formatTime(59.999)).toBe('00:59');
    expect(formatTime(60)).toBe('01:00');
    expect(formatTime(61.5)).toBe('01:01');
    expect(formatTime(599)).toBe('09:59');
    expect(formatTime(600)).toBe('10:00');
  });

  it('renders --:-- for the -1 sentinel', () => {
    expect(formatTime(NO_HIGH_SCORE)).toBe('--:--');
    expect(formatTime(-1)).toBe('--:--');
  });

  it('renders --:-- for any other negative or non-finite value', () => {
    expect(formatTime(-42)).toBe('--:--');
    expect(formatTime(Number.NaN)).toBe('--:--');
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('--:--');
  });

  it('does not clamp minutes to two digits', () => {
    // Unity's integer formatting overflows the same way.
    expect(formatTime(6000)).toBe('100:00');
  });
});

describe('tickTimer', () => {
  it('does nothing while stopped', () => {
    expect(tickTimer(INITIAL_TIMER, 0.016, false)).toBe(INITIAL_TIMER);
  });

  it('accumulates delta while running', () => {
    const running = { elapsedSeconds: 0, running: true };
    const after = tickTimer(running, 0.5, false);
    expect(after.elapsedSeconds).toBeCloseTo(0.5, 10);
  });

  it('stops accumulating once solved, even if still flagged running', () => {
    const running = { elapsedSeconds: 12, running: true };
    expect(tickTimer(running, 0.5, true)).toBe(running);
  });

  it('ignores non-positive and non-finite deltas', () => {
    const running = { elapsedSeconds: 3, running: true };
    expect(tickTimer(running, 0, false)).toBe(running);
    expect(tickTimer(running, -1, false)).toBe(running);
    expect(tickTimer(running, Number.NaN, false)).toBe(running);
  });

  it('returns the same object when nothing changes, so React can bail out', () => {
    const running = { elapsedSeconds: 3, running: true };
    expect(tickTimer(running, 0, false)).toBe(running);
  });
});

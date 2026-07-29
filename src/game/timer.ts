/**
 * Elapsed-time formatting — docs/game-logic.md §4.4.
 */

import { NO_HIGH_SCORE } from './constants';

/**
 * `mm:ss`, floored, zero-padded — matching
 * `{totalSeconds/60:00}:{totalSeconds%60:00}`.
 *
 * The sentinel `-1` (no record) renders as `--:--`. Any other negative value is
 * treated the same way rather than producing `-1:-1`.
 *
 * Minutes are NOT clamped to two digits: a 100-minute session renders `100:00`,
 * as Unity's integer formatting does.
 */
export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= NO_HIGH_SCORE) return '--:--';

  const floored = Math.floor(Math.max(0, totalSeconds));
  const minutes = Math.floor(floored / 60);
  const seconds = floored % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export interface TimerState {
  readonly elapsedSeconds: number;
  readonly running: boolean;
}

export const INITIAL_TIMER: TimerState = { elapsedSeconds: 0, running: false };

/**
 * Advance the timer by one frame.
 *
 * `Update(): if timerRunning && !isSolved: elapsedSeconds += deltaTime`.
 * The solved check lives here rather than at the call site so a stray tick after
 * the winning move cannot inflate the recorded time.
 */
export function tickTimer(timer: TimerState, deltaSeconds: number, solved: boolean): TimerState {
  if (!timer.running || solved) return timer;
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return timer;

  return { ...timer, elapsedSeconds: timer.elapsedSeconds + deltaSeconds };
}

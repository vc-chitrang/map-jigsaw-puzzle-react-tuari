import { useEffect, useRef } from 'react';
import {
  AUTO_SHUFFLE_INTERVAL_S,
  TILE_MOVE_DURATION_S,
  WIN_SCREEN_DELAY_S,
  pickAutoShuffleMove,
  type GameAction,
  type GameState,
} from '../../game';

type Dispatch = (action: GameAction) => void;

/**
 * Timer accumulation.
 *
 * Unity adds `deltaTime` every frame. Doing that here would re-render at 60 fps
 * to change a string that only updates once a second, so the tick runs at 4 Hz
 * with the *measured* elapsed time — same total, a fifteenth of the renders.
 */
const TICK_INTERVAL_MS = 250;

export function useGameTimer(running: boolean, solved: boolean, dispatch: Dispatch): void {
  useEffect(() => {
    if (!running || solved) return;

    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const deltaSeconds = (now - last) / 1000;
      last = now;
      dispatch({ type: 'TICK', deltaSeconds });
    }, TICK_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [running, solved, dispatch]);
}

/**
 * Ends the tile slide.
 *
 * A timeout, not `transitionend`. A dropped transition event would leave
 * `isAnimating` stuck and block all further input — the same class of failure as
 * the Unity transition-overlay bug (ADR-002). The timeout is the authority; the
 * CSS transition just has to finish within it.
 */
export function useMoveSettler(isAnimating: boolean, dispatch: Dispatch): void {
  useEffect(() => {
    if (!isAnimating) return;

    const id = window.setTimeout(
      () => dispatch({ type: 'MOVE_SETTLED' }),
      TILE_MOVE_DURATION_S * 1000,
    );

    return () => window.clearTimeout(id);
  }, [isAnimating, dispatch]);
}

/**
 * Attract mode: one random tile per second.
 *
 * These moves never start the timer, never count, and never check for a win —
 * that is enforced in the reducer, not here (docs/game-logic.md §6.1).
 */
export function useAutoShuffle(state: GameState, dispatch: Dispatch, enabled = true): void {
  // Keep the latest state in a ref so the interval is created once per mode
  // change rather than restarted on every tick.
  const latest = useRef(state);
  latest.current = state;

  const active = enabled && state.mode === 'launch' && state.board !== null;

  useEffect(() => {
    if (!active) return;

    const id = window.setInterval(() => {
      const current = latest.current;
      if (!current.board) return;
      if (current.isAnimating || current.isSolved) return;
      if (current.mode !== 'launch') return;

      const cell = pickAutoShuffleMove(current.board, current.lastAutoMoveFrom);
      if (!cell) return;

      dispatch({ type: 'MOVE_STARTED', cell, source: 'auto' });
    }, AUTO_SHUFFLE_INTERVAL_S * 1000);

    return () => window.clearInterval(id);
  }, [active, dispatch]);
}

/** The 1 s realtime pause between the 9th slice appearing and the win screen. */
export function useWinDelay(revealing: boolean, dispatch: Dispatch): void {
  useEffect(() => {
    if (!revealing) return;

    const id = window.setTimeout(
      () => dispatch({ type: 'WIN_DELAY_ELAPSED' }),
      WIN_SCREEN_DELAY_S * 1000,
    );

    return () => window.clearTimeout(id);
  }, [revealing, dispatch]);
}

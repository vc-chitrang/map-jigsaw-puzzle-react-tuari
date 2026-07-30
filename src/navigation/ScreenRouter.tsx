import { useEffect, type ReactNode } from 'react';
import {
  FADE_IN_EASING,
  FADE_MS,
  FADE_OUT_EASING,
  FADE_TIMEOUT_MS,
  overlayOpacity,
  overlayPointerEvents,
  type NavAction,
  type NavState,
} from './router';
import styles from './ScreenRouter.module.css';

/**
 * The cross-fade overlay and its timers.
 *
 * All navigation RULES live in `router.ts`; this component only turns the phase
 * into pixels and drives the clock.
 *
 * TWO TIMERS, DELIBERATELY (ADR-002):
 *
 *   * the PRIMARY timer advances the phase after `FADE_MS`. A timeout rather than
 *     `transitionend`, because a dropped transition event is exactly what left the
 *     Unity overlay blocking input forever. The CSS transition is decoration; the
 *     timer is the authority.
 *   * the RECOVERY timer forces `idle` after `FADE_TIMEOUT_MS`. It should never
 *     fire — if the primary timer works, the phase has already moved on and the
 *     effect has been torn down. It exists for the case the primary does not run
 *     at all, e.g. a throttled background tab or a mount that threw.
 *
 * `pointer-events` comes from `overlayPointerEvents` and nowhere else.
 */

interface ScreenRouterProps {
  readonly state: NavState;
  readonly dispatch: (action: NavAction) => void;
  /** The screen for `state.current`. */
  readonly children: ReactNode;
}

export function ScreenRouter({ state, dispatch, children }: ScreenRouterProps) {
  const { phase } = state;

  useEffect(() => {
    if (phase === 'idle') return;

    const advance = window.setTimeout(() => {
      dispatch({ type: phase === 'fadingOut' ? 'FADE_OUT_DONE' : 'FADE_IN_DONE' });
    }, FADE_MS);

    const recover = window.setTimeout(() => {
      // Reaching here means the primary timer did not run. Log it: this is the
      // failure the Unity build hit silently for weeks.
      console.warn(`[router] transition recovery fired in phase ${phase}`);
      dispatch({ type: 'FORCE_IDLE' });
    }, FADE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(advance);
      window.clearTimeout(recover);
    };
  }, [phase, dispatch]);

  return (
    <>
      {children}

      <div
        className={styles.overlay}
        style={{
          opacity: overlayOpacity(phase),
          // THE ONE DERIVATION. Do not add a second condition here.
          pointerEvents: overlayPointerEvents(phase),
          transition:
            phase === 'idle'
              ? 'none'
              : `opacity ${FADE_MS}ms ${phase === 'fadingOut' ? FADE_OUT_EASING : FADE_IN_EASING}`,
        }}
        // Not an interactive element; it exists to cover and to block.
        aria-hidden="true"
        data-phase={phase}
      />
    </>
  );
}

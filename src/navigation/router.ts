/**
 * Screen navigation — pure state machine.
 *
 * Replaces Unity's `ScreenManager`. PURE: no React, no DOM, no timers, so every
 * rule here is unit-testable.
 *
 * WHY THIS IS MODELLED SO CAREFULLY (ADR-002): in Unity an interrupted DOTween
 * cross-fade could leave the full-screen fade overlay with `blocksRaycasts = true`
 * AND `_isTransitioning = true`. One cause, two symptoms: an invisible click
 * blocker over everything, and all later navigation silently no-oping. The Start
 * button "randomly stopped working".
 *
 * The defence is structural, not defensive coding:
 *
 *   1. The transition is EXPLICIT state (`idle | fadingOut | fadingIn`), not a
 *      boolean flag plus an animation.
 *   2. `pointer-events` is DERIVED from that state by `overlayPointerEvents`,
 *      which is the single place it is decided.
 *   3. `forceIdle` exists so a caller's timeout can always recover, whatever the
 *      animation did or did not do.
 *
 * The invariant is one line: `phase === 'idle'` implies pointer-events `none`.
 */

/**
 * Screens the router swaps between.
 *
 * `QRScanScreen` and `Artwork Focus Screen` are deprecated and not ported.
 *
 * The WIN screen is deliberately NOT here. Its root background is alpha 0 in the
 * scene, so the solved board and the full-image preview must stay visible behind
 * it — cross-fading to black would hide exactly what the visitor just finished.
 * It renders as an overlay inside the Puzzle screen instead.
 */
export type ScreenId = 'puzzle' | 'select' | 'collection' | 'browse' | 'crop';

export type TransitionPhase = 'idle' | 'fadingOut' | 'fadingIn';

/** Per half, in ms. Total 400 ms (docs/game-logic.md §6.3). */
export const FADE_MS = 200;

/**
 * Recovery deadline. If the animation has not reported back within a half-fade
 * plus this slack, the caller forces `idle`. Unity's equivalent was a
 * `LateUpdate` assertion that the overlay never blocks while not transitioning.
 */
export const FADE_TIMEOUT_SLACK_MS = 100;
export const FADE_TIMEOUT_MS = FADE_MS + FADE_TIMEOUT_SLACK_MS;

export interface NavState {
  /** The screen currently mounted. */
  readonly current: ScreenId;
  /** Where we are heading. Non-null only while fading out. */
  readonly pending: ScreenId | null;
  readonly phase: TransitionPhase;
  /**
   * True when Crop was entered from Browse, which decides where Back goes
   * (docs/game-logic.md §6.3). Tracked here because it is navigation history,
   * not screen state.
   */
  readonly cropCameFromBrowse: boolean;
}

export const INITIAL_NAV_STATE: NavState = {
  current: 'puzzle',
  pending: null,
  phase: 'idle',
  cropCameFromBrowse: false,
};

export type NavAction =
  /** Begin a cross-fade to `to`. Ignored while a transition is running. */
  | { type: 'NAVIGATE'; to: ScreenId }
  /** The out half finished: swap screens at full black. */
  | { type: 'FADE_OUT_DONE' }
  /** The in half finished: the overlay must stop blocking. */
  | { type: 'FADE_IN_DONE' }
  /**
   * Recovery. Completes whatever the transition was doing and returns to `idle`.
   * Safe from any phase — that is the point.
   */
  | { type: 'FORCE_IDLE' };

/**
 * THE SINGLE PLACE `pointer-events` IS DECIDED.
 *
 * Do not inline this test anywhere else, and do not add a second condition to
 * the overlay's style. The Unity bug was exactly a second, divergent source of
 * truth for "is the overlay blocking?".
 */
export function overlayPointerEvents(phase: TransitionPhase): 'auto' | 'none' {
  return phase === 'idle' ? 'none' : 'auto';
}

/** Overlay opacity target for a phase. Black at the swap point. */
export function overlayOpacity(phase: TransitionPhase): number {
  return phase === 'fadingOut' ? 1 : 0;
}

/** True while a transition is in flight; input on the screens is suppressed. */
export function isTransitioning(state: NavState): boolean {
  return state.phase !== 'idle';
}

export function navReducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'NAVIGATE': {
      // A second tap during a transition is dropped rather than queued: Unity
      // behaves the same way, and queueing would let a visitor stack up screens
      // by drumming on a button.
      if (state.phase !== 'idle') return state;
      if (action.to === state.current) return state;

      return { ...state, pending: action.to, phase: 'fadingOut' };
    }

    case 'FADE_OUT_DONE': {
      if (state.phase !== 'fadingOut') return state;

      // Swap at full black. `pending` should always be set here, but if it is
      // not, fade back in on the current screen rather than getting stuck.
      const next = state.pending ?? state.current;

      return {
        ...state,
        current: next,
        pending: null,
        phase: 'fadingIn',
        // Remember how Crop was reached, for the Back rule.
        cropCameFromBrowse:
          next === 'crop' ? state.current === 'browse' : state.cropCameFromBrowse,
      };
    }

    case 'FADE_IN_DONE': {
      if (state.phase !== 'fadingIn') return state;
      return { ...state, phase: 'idle' };
    }

    case 'FORCE_IDLE': {
      if (state.phase === 'idle') return state;

      // Finish the job the transition was doing. Landing on `pending` rather
      // than reverting means a timeout during the out-half still completes the
      // navigation the visitor asked for.
      const next = state.pending ?? state.current;

      return {
        ...state,
        current: next,
        pending: null,
        phase: 'idle',
        cropCameFromBrowse:
          next === 'crop' && state.pending !== null
            ? state.current === 'browse'
            : state.cropCameFromBrowse,
      };
    }

    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

/**
 * What Back does. Custom rules, from docs/game-logic.md §6.3 plus the Select The
 * Collection screen the client added on 2026-08-04:
 *
 *   | From        | Back goes to                                      |
 *   | Browse      | SelectCollection                                  |
 *   | Collection  | ImageSelectOrUpload                               |
 *   | Crop        | Browse if it came from Browse, else ImageSelect    |
 *   | ImageSelect | Puzzle, resetting to launch mode                  |
 *   | Puzzle      | reset to launch mode if mid-game, else QUIT       |
 *
 * Browse used to go back to ImageSelect. It now goes to Collection, because
 * Collection is the only way into Browse — returning past it would skip the
 * screen that chose the department currently filtering the grid.
 */
export type BackOutcome =
  | { kind: 'navigate'; to: ScreenId; resetToLaunch: boolean }
  /** Already on Puzzle mid-game: abandon the game, return to attract mode. */
  | { kind: 'resetToLaunch' }
  /** Already on Puzzle and not mid-game: leave the app (staff exit). */
  | { kind: 'quit' };

export interface BackContext {
  /** A game is in progress on the Puzzle screen. */
  readonly puzzleMidGame: boolean;
}

export function resolveBack(state: NavState, context: BackContext): BackOutcome {
  switch (state.current) {
    case 'browse':
      return { kind: 'navigate', to: 'collection', resetToLaunch: false };

    case 'collection':
      return { kind: 'navigate', to: 'select', resetToLaunch: false };

    case 'crop':
      return {
        kind: 'navigate',
        to: state.cropCameFromBrowse ? 'browse' : 'select',
        resetToLaunch: false,
      };

    case 'select':
      return { kind: 'navigate', to: 'puzzle', resetToLaunch: true };

    case 'puzzle':
      return context.puzzleMidGame ? { kind: 'resetToLaunch' } : { kind: 'quit' };

    default: {
      const unreachable: never = state.current;
      return unreachable;
    }
  }
}

/** DOTween easing for each half of the fade (pixel-perfect-replication §6). */
export const FADE_OUT_EASING = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'; // OutQuad
export const FADE_IN_EASING = 'cubic-bezier(0.55, 0.085, 0.68, 0.53)'; // InQuad

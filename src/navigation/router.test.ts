import { describe, expect, it } from 'vitest';
import {
  FADE_MS,
  FADE_TIMEOUT_MS,
  INITIAL_NAV_STATE,
  isTransitioning,
  navReducer,
  overlayOpacity,
  overlayPointerEvents,
  resolveBack,
  type NavAction,
  type NavState,
  type ScreenId,
  type TransitionPhase,
} from './router';

const ALL_PHASES: TransitionPhase[] = ['idle', 'fadingOut', 'fadingIn'];
const ALL_SCREENS: ScreenId[] = ['puzzle', 'select', 'browse', 'crop'];

function run(state: NavState, ...actions: NavAction[]): NavState {
  return actions.reduce(navReducer, state);
}

/** Drive a complete cross-fade from `from` to `to`. */
function navigate(state: NavState, to: ScreenId): NavState {
  return run(state, { type: 'NAVIGATE', to }, { type: 'FADE_OUT_DONE' }, { type: 'FADE_IN_DONE' });
}

describe('THE INVARIANT — idle implies the overlay never blocks input (ADR-002)', () => {
  it('pointer-events is none when idle and auto otherwise', () => {
    expect(overlayPointerEvents('idle')).toBe('none');
    expect(overlayPointerEvents('fadingOut')).toBe('auto');
    expect(overlayPointerEvents('fadingIn')).toBe('auto');
  });

  it('holds for every phase reachable by any action sequence', () => {
    // Exhaustive over the action space to a depth that covers every path in and
    // out of a transition, including interrupted ones.
    const actions: NavAction[] = [
      { type: 'NAVIGATE', to: 'select' },
      { type: 'NAVIGATE', to: 'browse' },
      { type: 'FADE_OUT_DONE' },
      { type: 'FADE_IN_DONE' },
      { type: 'FORCE_IDLE' },
    ];

    const visited = new Set<TransitionPhase>();

    const walk = (state: NavState, depth: number) => {
      visited.add(state.phase);
      // This is the assertion that matters: the Unity bug was precisely a state
      // where phase said "not transitioning" but the overlay still blocked.
      if (state.phase === 'idle') {
        expect(overlayPointerEvents(state.phase)).toBe('none');
      }
      if (depth === 0) return;
      for (const action of actions) walk(navReducer(state, action), depth - 1);
    };

    walk(INITIAL_NAV_STATE, 4);

    // Confirm the walk actually reached every phase, so the assertion above was
    // not trivially satisfied by never leaving `idle`.
    expect([...visited].sort()).toEqual(['fadingIn', 'fadingOut', 'idle']);
  });

  it('FORCE_IDLE always lands on idle, from any phase', () => {
    for (const phase of ALL_PHASES) {
      const stuck: NavState = {
        current: 'browse',
        pending: phase === 'fadingOut' ? 'crop' : null,
        phase,
        cropCameFromBrowse: false,
      };
      const recovered = navReducer(stuck, { type: 'FORCE_IDLE' });
      expect(recovered.phase).toBe('idle');
      expect(overlayPointerEvents(recovered.phase)).toBe('none');
      expect(recovered.pending).toBeNull();
    }
  });
});

describe('overlay opacity', () => {
  it('is 1 only at the swap point', () => {
    expect(overlayOpacity('idle')).toBe(0);
    expect(overlayOpacity('fadingOut')).toBe(1);
    expect(overlayOpacity('fadingIn')).toBe(0);
  });
});

describe('timings', () => {
  it('is 200 ms per half with a 100 ms recovery slack', () => {
    expect(FADE_MS).toBe(200);
    expect(FADE_TIMEOUT_MS).toBe(300);
  });
});

describe('cross-fade sequence', () => {
  it('swaps the screen at full black, not at the start', () => {
    const out = navReducer(INITIAL_NAV_STATE, { type: 'NAVIGATE', to: 'select' });
    expect(out.phase).toBe('fadingOut');
    // Still showing the old screen while fading out.
    expect(out.current).toBe('puzzle');
    expect(out.pending).toBe('select');

    const swapped = navReducer(out, { type: 'FADE_OUT_DONE' });
    expect(swapped.current).toBe('select');
    expect(swapped.pending).toBeNull();
    expect(swapped.phase).toBe('fadingIn');

    const done = navReducer(swapped, { type: 'FADE_IN_DONE' });
    expect(done.phase).toBe('idle');
    expect(done.current).toBe('select');
  });

  it('ignores a NAVIGATE while already transitioning', () => {
    const out = navReducer(INITIAL_NAV_STATE, { type: 'NAVIGATE', to: 'select' });
    const spammed = navReducer(out, { type: 'NAVIGATE', to: 'browse' });
    // Dropped, not queued: drumming on a button must not stack transitions.
    expect(spammed).toBe(out);
    expect(spammed.pending).toBe('select');
  });

  it('ignores a NAVIGATE to the screen already showing', () => {
    expect(navReducer(INITIAL_NAV_STATE, { type: 'NAVIGATE', to: 'puzzle' })).toBe(
      INITIAL_NAV_STATE,
    );
  });

  it('ignores out-of-order completion events', () => {
    expect(navReducer(INITIAL_NAV_STATE, { type: 'FADE_OUT_DONE' })).toBe(INITIAL_NAV_STATE);
    expect(navReducer(INITIAL_NAV_STATE, { type: 'FADE_IN_DONE' })).toBe(INITIAL_NAV_STATE);

    const out = navReducer(INITIAL_NAV_STATE, { type: 'NAVIGATE', to: 'select' });
    // A stray FADE_IN_DONE during the out half must not end the transition early.
    expect(navReducer(out, { type: 'FADE_IN_DONE' })).toBe(out);
  });

  it('completes the requested navigation when the out half times out', () => {
    const out = navReducer(INITIAL_NAV_STATE, { type: 'NAVIGATE', to: 'browse' });
    const recovered = navReducer(out, { type: 'FORCE_IDLE' });
    // The visitor asked for Browse; a dropped transitionend must not strand them.
    expect(recovered.current).toBe('browse');
    expect(recovered.phase).toBe('idle');
  });

  it('stays put when the in half times out', () => {
    const inHalf = run(
      INITIAL_NAV_STATE,
      { type: 'NAVIGATE', to: 'browse' },
      { type: 'FADE_OUT_DONE' },
    );
    const recovered = navReducer(inHalf, { type: 'FORCE_IDLE' });
    expect(recovered.current).toBe('browse');
    expect(recovered.phase).toBe('idle');
  });

  it('fades back in on the current screen if pending is somehow missing', () => {
    const broken: NavState = {
      current: 'browse',
      pending: null,
      phase: 'fadingOut',
      cropCameFromBrowse: false,
    };
    const swapped = navReducer(broken, { type: 'FADE_OUT_DONE' });
    expect(swapped.current).toBe('browse');
    expect(swapped.phase).toBe('fadingIn');
  });
});

describe('isTransitioning', () => {
  it('is false only when idle', () => {
    expect(isTransitioning(INITIAL_NAV_STATE)).toBe(false);
    expect(isTransitioning({ ...INITIAL_NAV_STATE, phase: 'fadingOut' })).toBe(true);
    expect(isTransitioning({ ...INITIAL_NAV_STATE, phase: 'fadingIn' })).toBe(true);
  });
});

describe('cropCameFromBrowse tracking', () => {
  it('is true when Crop is entered from Browse', () => {
    let state = navigate(INITIAL_NAV_STATE, 'select');
    state = navigate(state, 'browse');
    state = navigate(state, 'crop');
    expect(state.cropCameFromBrowse).toBe(true);
  });

  it('is false when Crop is entered from ImageSelect — a QR upload', () => {
    let state = navigate(INITIAL_NAV_STATE, 'select');
    state = navigate(state, 'crop');
    expect(state.cropCameFromBrowse).toBe(false);
  });

  it('is recorded even when the transition is forced idle', () => {
    let state = navigate(INITIAL_NAV_STATE, 'select');
    state = navigate(state, 'browse');
    state = navReducer(state, { type: 'NAVIGATE', to: 'crop' });
    state = navReducer(state, { type: 'FORCE_IDLE' });
    expect(state.current).toBe('crop');
    expect(state.cropCameFromBrowse).toBe(true);
  });
});

describe('resolveBack — the custom rules from game-logic §6.3', () => {
  const at = (current: ScreenId, cropCameFromBrowse = false): NavState => ({
    ...INITIAL_NAV_STATE,
    current,
    cropCameFromBrowse,
  });

  /**
   * Browse used to return to ImageSelect. The "Select The Collection" screen
   * (2026-08-04) is now the only route into Browse, so skipping back past it would
   * bypass the screen that chose the department filtering the grid.
   */
  it('Browse goes back to Select The Collection', () => {
    expect(resolveBack(at('browse'), { puzzleMidGame: false })).toEqual({
      kind: 'navigate',
      to: 'collection',
      resetToLaunch: false,
    });
  });

  it('Select The Collection goes back to ImageSelect', () => {
    expect(resolveBack(at('collection'), { puzzleMidGame: false })).toEqual({
      kind: 'navigate',
      to: 'select',
      resetToLaunch: false,
    });
  });

  /** The full chain the visitor walks out through, one step at a time. */
  it('unwinds Browse -> Collection -> ImageSelect -> Puzzle', () => {
    const fromBrowse = resolveBack(at('browse'), { puzzleMidGame: false });
    expect(fromBrowse).toMatchObject({ to: 'collection' });

    const fromCollection = resolveBack(at('collection'), { puzzleMidGame: false });
    expect(fromCollection).toMatchObject({ to: 'select' });

    const fromSelect = resolveBack(at('select'), { puzzleMidGame: false });
    expect(fromSelect).toMatchObject({ to: 'puzzle', resetToLaunch: true });
  });

  it('Crop goes back to Browse when it came from Browse', () => {
    expect(resolveBack(at('crop', true), { puzzleMidGame: false })).toEqual({
      kind: 'navigate',
      to: 'browse',
      resetToLaunch: false,
    });
  });

  it('Crop goes back to ImageSelect otherwise — a QR upload has no Browse history', () => {
    expect(resolveBack(at('crop', false), { puzzleMidGame: false })).toEqual({
      kind: 'navigate',
      to: 'select',
      resetToLaunch: false,
    });
  });

  it('ImageSelect goes back to Puzzle AND resets to launch mode', () => {
    expect(resolveBack(at('select'), { puzzleMidGame: false })).toEqual({
      kind: 'navigate',
      to: 'puzzle',
      resetToLaunch: true,
    });
  });

  it('Puzzle mid-game abandons the game rather than quitting', () => {
    expect(resolveBack(at('puzzle'), { puzzleMidGame: true })).toEqual({ kind: 'resetToLaunch' });
  });

  it('Puzzle in attract mode quits the app', () => {
    expect(resolveBack(at('puzzle'), { puzzleMidGame: false })).toEqual({ kind: 'quit' });
  });

  it('returns an outcome for every screen — no screen can strand a visitor', () => {
    for (const screen of ALL_SCREENS) {
      for (const midGame of [true, false]) {
        const outcome = resolveBack(at(screen), { puzzleMidGame: midGame });
        expect(['navigate', 'resetToLaunch', 'quit']).toContain(outcome.kind);
      }
    }
  });
});

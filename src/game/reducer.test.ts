import { describe, expect, it } from 'vitest';
import {
  INITIAL_GAME_STATE,
  NO_HIGH_SCORE,
  applyMove,
  canAcceptInput,
  createSolvedBoard,
  gameReducer,
  revealedSliceCell,
  shouldRevealLastSlice,
  statusText,
  type GameAction,
  type GameState,
} from './index';
import { cell } from './testing';

const solved = createSolvedBoard();
/** Empty at (2,1); moving the tile at (2,2) back restores the solved board. */
const oneMoveFromSolved = applyMove(solved, cell(2, 1))!;

function run(state: GameState, ...actions: GameAction[]): GameState {
  return actions.reduce(gameReducer, state);
}

function built(board = solved, extra: Partial<GameState> = {}): GameState {
  return {
    ...gameReducer(INITIAL_GAME_STATE, { type: 'BUILD', board }),
    ...extra,
  };
}

describe('BUILD', () => {
  it('starts in attract (launch) mode by default', () => {
    const state = built();
    expect(state.mode).toBe('launch');
    expect(state.moveCount).toBe(0);
    expect(state.timer).toEqual({ elapsedSeconds: 0, running: false });
    expect(state.isSolved).toBe(false);
    expect(state.phase).toBe('playing');
  });

  it('starts in gameplay when the Play Again flag is armed', () => {
    const afterPlayAgain = gameReducer(built(), {
      type: 'RESET_TO_LAUNCH_MODE',
      startGameplayImmediately: true,
    });
    expect(afterPlayAgain.startGameplayImmediately).toBe(true);

    const rebuilt = gameReducer(afterPlayAgain, { type: 'BUILD', board: solved });
    expect(rebuilt.mode).toBe('gameplay');
  });

  it('carries the loaded high score and artwork identity', () => {
    const state = gameReducer(INITIAL_GAME_STATE, {
      type: 'BUILD',
      board: solved,
      identity: { artworkTitle: 'Ragamala' },
      highScoreSeconds: 42,
    });
    expect(state.identity.artworkTitle).toBe('Ragamala');
    expect(state.highScoreSeconds).toBe(42);
  });
});

describe('timer start — parity checklist §12.4', () => {
  it('starts on the FIRST PLAYER move, not on build', () => {
    const state = built();
    expect(state.timer.running).toBe(false);

    const moved = gameReducer(state, { type: 'MOVE_STARTED', cell: cell(2, 1), source: 'player' });
    expect(moved.timer.running).toBe(true);
  });

  it('does NOT start on an attract-mode auto-shuffle move', () => {
    const moved = gameReducer(built(), {
      type: 'MOVE_STARTED',
      cell: cell(2, 1),
      source: 'auto',
    });
    expect(moved.timer.running).toBe(false);
    expect(moved.mode).toBe('launch');
  });

  it('keeps running across later moves without resetting elapsed time', () => {
    let state = gameReducer(built(), {
      type: 'MOVE_STARTED',
      cell: cell(2, 1),
      source: 'player',
    });
    state = run(state, { type: 'MOVE_SETTLED' }, { type: 'TICK', deltaSeconds: 3 });
    expect(state.timer.elapsedSeconds).toBeCloseTo(3, 10);

    state = run(
      state,
      { type: 'MOVE_STARTED', cell: cell(1, 1), source: 'player' },
      { type: 'MOVE_SETTLED' },
    );
    expect(state.timer.running).toBe(true);
    expect(state.timer.elapsedSeconds).toBeCloseTo(3, 10);
  });
});

describe('move accounting', () => {
  it('counts a player move only once the tween settles', () => {
    let state = gameReducer(built(), {
      type: 'MOVE_STARTED',
      cell: cell(2, 1),
      source: 'player',
    });
    expect(state.moveCount).toBe(0);
    expect(state.isAnimating).toBe(true);

    state = gameReducer(state, { type: 'MOVE_SETTLED' });
    expect(state.moveCount).toBe(1);
    expect(state.isAnimating).toBe(false);
  });

  it('does not count auto-shuffle moves', () => {
    const state = run(
      built(),
      { type: 'MOVE_STARTED', cell: cell(2, 1), source: 'auto' },
      { type: 'MOVE_SETTLED' },
    );
    expect(state.moveCount).toBe(0);
  });

  it('ignores an illegal move entirely', () => {
    const state = built();
    const after = gameReducer(state, {
      type: 'MOVE_STARTED',
      cell: cell(0, 0),
      source: 'player',
    });
    expect(after).toBe(state);
  });

  it('ignores MOVE_SETTLED when nothing is animating', () => {
    const state = built();
    expect(gameReducer(state, { type: 'MOVE_SETTLED' })).toBe(state);
  });

  it('tracks the auto-move source cell so the next tick cannot reverse it', () => {
    const state = gameReducer(built(), {
      type: 'MOVE_STARTED',
      cell: cell(2, 1),
      source: 'auto',
    });
    expect(state.lastAutoMoveFrom).toEqual({ x: 2, y: 1 });
  });
});

describe('win sequence — parity checklist §12.6', () => {
  it('fires only when every tile is home, and only on a player move', () => {
    const state = run(
      built(oneMoveFromSolved),
      { type: 'MOVE_STARTED', cell: cell(2, 2), source: 'player' },
      { type: 'MOVE_SETTLED' },
    );

    expect(state.isSolved).toBe(true);
    expect(state.phase).toBe('revealing');
    expect(state.timer.running).toBe(false);
    expect(statusText(state)).toBe('Solved in 1 moves');
  });

  it('does NOT fire when an attract-mode move happens to solve the board', () => {
    const state = run(
      built(oneMoveFromSolved),
      { type: 'MOVE_STARTED', cell: cell(2, 2), source: 'auto' },
      { type: 'MOVE_SETTLED' },
    );

    expect(state.isSolved).toBe(false);
    expect(state.phase).toBe('playing');
  });

  it('reveals the 9th slice from the winning move, in the bottom-right cell', () => {
    const revealing = run(
      built(oneMoveFromSolved),
      { type: 'MOVE_STARTED', cell: cell(2, 2), source: 'player' },
      { type: 'MOVE_SETTLED' },
    );

    expect(shouldRevealLastSlice(revealing)).toBe(true);
    expect(revealedSliceCell(revealing)).toEqual({ x: 2, y: 2 });
  });

  it('does not reveal anything before the win', () => {
    const state = built();
    expect(shouldRevealLastSlice(state)).toBe(false);
    expect(revealedSliceCell(state)).toBeNull();
  });

  it('shows the win screen only after the 1 s delay elapses', () => {
    let state = run(
      built(oneMoveFromSolved),
      { type: 'MOVE_STARTED', cell: cell(2, 2), source: 'player' },
      { type: 'MOVE_SETTLED' },
    );
    expect(state.phase).toBe('revealing');
    expect(state.previewVisible).toBe(false);

    state = gameReducer(state, { type: 'WIN_DELAY_ELAPSED' });
    expect(state.phase).toBe('won');
    expect(state.previewVisible).toBe(true);
  });

  it('ignores WIN_DELAY_ELAPSED outside the revealing phase', () => {
    const state = built();
    expect(gameReducer(state, { type: 'WIN_DELAY_ELAPSED' })).toBe(state);
  });

  it('freezes the timer after the win', () => {
    const solvedState = run(
      built(oneMoveFromSolved),
      { type: 'MOVE_STARTED', cell: cell(2, 2), source: 'player' },
      { type: 'TICK', deltaSeconds: 5 },
      { type: 'MOVE_SETTLED' },
      { type: 'TICK', deltaSeconds: 5 },
    );
    expect(solvedState.timer.elapsedSeconds).toBeCloseTo(5, 10);
  });
});

describe('canAcceptInput — parity checklist §12.11', () => {
  it('rejects input while animating', () => {
    const state = gameReducer(built(), {
      type: 'MOVE_STARTED',
      cell: cell(2, 1),
      source: 'player',
    });
    expect(canAcceptInput(state)).toBe(false);
  });

  it('rejects input once solved', () => {
    const state = run(
      built(oneMoveFromSolved),
      { type: 'MOVE_STARTED', cell: cell(2, 2), source: 'player' },
      { type: 'MOVE_SETTLED' },
    );
    expect(canAcceptInput(state)).toBe(false);
  });

  it('rejects input while the preview overlay is visible', () => {
    const state = gameReducer(built(), { type: 'SET_PREVIEW_VISIBLE', visible: true });
    expect(canAcceptInput(state)).toBe(false);
  });

  it('rejects input when there is no board', () => {
    expect(canAcceptInput(INITIAL_GAME_STATE)).toBe(false);
  });

  it('ACCEPTS input in attract mode — the first tap is what leaves it', () => {
    expect(canAcceptInput(built())).toBe(true);
  });
});

describe('mode transitions — docs/game-logic.md §6.2', () => {
  it('EXIT_LAUNCH_MODE leaves attract mode and clears the auto-shuffle memory', () => {
    const state = gameReducer(built(solved, { lastAutoMoveFrom: cell(2, 1) }), {
      type: 'EXIT_LAUNCH_MODE',
    });
    expect(state.mode).toBe('gameplay');
    expect(state.lastAutoMoveFrom).toBeNull();
  });

  it('EXIT_LAUNCH_MODE is a no-op once in gameplay', () => {
    const gameplay = gameReducer(built(), { type: 'EXIT_LAUNCH_MODE' });
    expect(gameReducer(gameplay, { type: 'EXIT_LAUNCH_MODE' })).toBe(gameplay);
  });

  it('a player move implies gameplay mode', () => {
    const state = gameReducer(built(), {
      type: 'MOVE_STARTED',
      cell: cell(2, 1),
      source: 'player',
    });
    expect(state.mode).toBe('gameplay');
  });

  it('"New Image" resets to attract mode without arming gameplay', () => {
    const state = gameReducer(built(), { type: 'RESET_TO_LAUNCH_MODE' });
    expect(state.startGameplayImmediately).toBe(false);
    expect(state.board).toBeNull();
    expect(state.highScoreSeconds).toBe(NO_HIGH_SCORE);
  });

  it('"Play Again" resets and arms gameplay for the next build', () => {
    const state = gameReducer(built(), {
      type: 'RESET_TO_LAUNCH_MODE',
      startGameplayImmediately: true,
    });
    expect(state.startGameplayImmediately).toBe(true);
  });
});

describe('statusText', () => {
  it('reports the move count during play', () => {
    expect(statusText(built())).toBe('Moves: 0');
  });
});

describe('HIGH_SCORE_LOADED', () => {
  it('stores the value supplied by the caller', () => {
    const state = gameReducer(built(), { type: 'HIGH_SCORE_LOADED', seconds: 77 });
    expect(state.highScoreSeconds).toBe(77);
  });
});

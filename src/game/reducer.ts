/**
 * Game state machine — docs/game-logic.md §4.2, §6.
 *
 * PURE: no storage, no timers, no DOM. Side effects (writing the high score,
 * waiting 1 s before the win screen, running the 140 ms tween) belong to the
 * caller, which dispatches the follow-up action when they complete. That keeps
 * every rule replayable from an action list.
 *
 * The two-step move (`MOVE_STARTED` → `MOVE_SETTLED`) mirrors Unity's
 * `MoveTileRoutine` exactly: the grid updates and the timer starts BEFORE the
 * tween, while the move count and the win check happen AFTER it. Collapsing them
 * into one step would reveal the 9th slice while the last tile is still sliding.
 */

import { applyMove, isInitialEmptyCell } from './moves';
import { createSolvedBoard, isSolved } from './board';
import { INITIAL_TIMER, tickTimer, type TimerState } from './timer';
import { NO_HIGH_SCORE } from './constants';
import type { ArtworkIdentity } from './highScore';
import type { BoardState, Cell, MoveSource } from './types';

/** Attract mode until the first interaction, then gameplay. */
export type GameMode = 'launch' | 'gameplay';

/**
 * `playing`  — normal play (or attract mode).
 * `revealing`— solved; the 9th slice is shown and the 1 s delay is running.
 * `won`      — win screen is up.
 */
export type PuzzlePhase = 'playing' | 'revealing' | 'won';

export interface GameState {
  readonly board: BoardState | null;
  readonly identity: ArtworkIdentity;
  readonly mode: GameMode;
  readonly phase: PuzzlePhase;
  readonly moveCount: number;
  readonly timer: TimerState;
  readonly isSolved: boolean;
  /** True between `MOVE_STARTED` and `MOVE_SETTLED`. Gates input. */
  readonly isAnimating: boolean;
  readonly previewVisible: boolean;
  /**
   * Set by "Play Again": the next image goes straight into gameplay instead of
   * attract mode. Consumed once the image has loaded
   * (`ConsumeStartGameplayFlag`).
   */
  readonly startGameplayImmediately: boolean;
  /** Best time for the current artwork, or -1. Supplied by the caller. */
  readonly highScoreSeconds: number;
  /** Previous attract-mode source cell, so auto-shuffle never reverses itself. */
  readonly lastAutoMoveFrom: Cell | null;
  /** Source of the in-flight move, so `MOVE_SETTLED` knows how to finish it. */
  readonly animatingSource: MoveSource | null;
}

export const INITIAL_GAME_STATE: GameState = {
  board: null,
  identity: {},
  mode: 'launch',
  phase: 'playing',
  moveCount: 0,
  timer: INITIAL_TIMER,
  isSolved: false,
  isAnimating: false,
  previewVisible: false,
  startGameplayImmediately: false,
  highScoreSeconds: NO_HIGH_SCORE,
  lastAutoMoveFrom: null,
  animatingSource: null,
};

export type GameAction =
  /** A board (already shuffled) is ready. `gameplay` skips attract mode. */
  | {
      type: 'BUILD';
      board: BoardState;
      identity?: ArtworkIdentity;
      highScoreSeconds?: number;
      mode?: GameMode;
    }
  /** First tile/arrow interaction — leaves attract mode. */
  | { type: 'EXIT_LAUNCH_MODE' }
  | { type: 'MOVE_STARTED'; cell: Cell; source: MoveSource }
  | { type: 'MOVE_SETTLED' }
  | { type: 'TICK'; deltaSeconds: number }
  /** The 1 s post-reveal delay elapsed. */
  | { type: 'WIN_DELAY_ELAPSED' }
  | { type: 'SET_PREVIEW_VISIBLE'; visible: boolean }
  | { type: 'HIGH_SCORE_LOADED'; seconds: number }
  /** "New Image" (attract) or "Play Again" (`startGameplayImmediately`). */
  | { type: 'RESET_TO_LAUNCH_MODE'; startGameplayImmediately?: boolean }
  /**
   * Debug/QA cheat: instantly solve the board and enter the win sequence, as if
   * the final tile had just settled. Wired to a hotkey (Ctrl+Shift+Alt+S) on the
   * Puzzle screen. Not reachable through normal play.
   */
  | { type: 'SOLVE_CHEAT' };

/**
 * Whether a tile/arrow tap should be accepted.
 *
 * `_isAnimating || _isSolved || IsPreviewVisible` reject input
 * (docs/game-logic.md §4.1). Note attract mode does NOT block input — the first
 * tap is what leaves it.
 */
export function canAcceptInput(state: GameState): boolean {
  if (!state.board) return false;
  return !state.isAnimating && !state.isSolved && !state.previewVisible;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'BUILD': {
      return {
        ...INITIAL_GAME_STATE,
        board: action.board,
        identity: action.identity ?? {},
        highScoreSeconds: action.highScoreSeconds ?? NO_HIGH_SCORE,
        // "Play Again" pre-arms gameplay mode; anything else starts in attract.
        mode: action.mode ?? (state.startGameplayImmediately ? 'gameplay' : 'launch'),
      };
    }

    case 'EXIT_LAUNCH_MODE': {
      if (state.mode === 'gameplay') return state;
      return { ...state, mode: 'gameplay', lastAutoMoveFrom: null };
    }

    case 'MOVE_STARTED': {
      if (!state.board) return state;

      const board = applyMove(state.board, action.cell);
      if (!board) return state;

      const isPlayerMove = action.source === 'player';

      return {
        ...state,
        board,
        isAnimating: true,
        animatingSource: action.source,
        // A player move always means we are out of attract mode.
        mode: isPlayerMove ? 'gameplay' : state.mode,
        // The timer starts on the FIRST PLAYER move — not on screen entry, and
        // never on an attract-mode auto-shuffle move.
        timer:
          isPlayerMove && !state.timer.running ? { ...state.timer, running: true } : state.timer,
        lastAutoMoveFrom: isPlayerMove ? state.lastAutoMoveFrom : action.cell,
      };
    }

    case 'MOVE_SETTLED': {
      if (!state.board || !state.isAnimating) return state;

      const wasPlayerMove = state.animatingSource === 'player';
      const settled: GameState = {
        ...state,
        isAnimating: false,
        animatingSource: null,
        moveCount: wasPlayerMove ? state.moveCount + 1 : state.moveCount,
      };

      // Attract-mode moves never check for a win: the board is shuffling itself
      // and a chance solve must not trigger the win screen.
      if (!wasPlayerMove) return settled;

      if (!isSolved(state.board)) return settled;

      return {
        ...settled,
        isSolved: true,
        phase: 'revealing',
        timer: { ...settled.timer, running: false },
      };
    }

    case 'TICK': {
      const timer = tickTimer(state.timer, action.deltaSeconds, state.isSolved);
      if (timer === state.timer) return state;
      return { ...state, timer };
    }

    case 'WIN_DELAY_ELAPSED': {
      if (state.phase !== 'revealing') return state;
      return { ...state, phase: 'won', previewVisible: true };
    }

    case 'SET_PREVIEW_VISIBLE': {
      return { ...state, previewVisible: action.visible };
    }

    case 'HIGH_SCORE_LOADED': {
      return { ...state, highScoreSeconds: action.seconds };
    }

    case 'RESET_TO_LAUNCH_MODE': {
      // The board itself is replaced by the BUILD that follows the image load;
      // only the flag survives, to be consumed there.
      return {
        ...INITIAL_GAME_STATE,
        startGameplayImmediately: action.startGameplayImmediately ?? false,
      };
    }

    case 'SOLVE_CHEAT': {
      // Only from active play (attract or gameplay); ignore once solving/won so a
      // second press cannot re-enter the sequence.
      if (!state.board || state.phase !== 'playing') return state;

      // Produce exactly the state a winning MOVE_SETTLED would: a solved board,
      // timer stopped, phase `revealing`. `useWinDelay` then fires the 1 s delay
      // to `won`, and the high-score write keyed on `revealing` runs — same as a
      // real solve.
      return {
        ...state,
        board: createSolvedBoard(state.board.size),
        mode: 'gameplay',
        isAnimating: false,
        animatingSource: null,
        isSolved: true,
        phase: 'revealing',
        timer: { ...state.timer, running: false },
      };
    }

    default: {
      // Exhaustiveness: a new action type without a case is a compile error.
      const unreachable: never = action;
      return unreachable;
    }
  }
}

/**
 * The status line Unity renders under the board:
 * `"Moves: {n}"`, or `"Solved in {n} moves"` once complete.
 */
export function statusText(state: GameState): string {
  if (state.isSolved) return `Solved in ${state.moveCount} moves`;
  return `Moves: ${state.moveCount}`;
}

/**
 * True while the 9th slice should be painted into the empty slot — from the
 * winning move onward (docs/game-logic.md §4.3).
 */
export function shouldRevealLastSlice(state: GameState): boolean {
  return state.isSolved && (state.phase === 'revealing' || state.phase === 'won');
}

/**
 * Which slice fills the empty slot on win: the board's initial empty cell, i.e.
 * bottom-right. Guarded so a mid-game call cannot return the wrong slice.
 */
export function revealedSliceCell(state: GameState): Cell | null {
  if (!state.board || !shouldRevealLastSlice(state)) return null;
  const cell = state.board.emptyCell;
  return isInitialEmptyCell(cell, state.board) ? cell : null;
}

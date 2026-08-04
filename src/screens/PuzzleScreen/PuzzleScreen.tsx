import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  BOARD_TUNING,
  INITIAL_GAME_STATE,
  boardRect,
  canAcceptInput,
  computeBoardGeometry,
  createShuffledBoard,
  formatHighScore,
  formatTime,
  gameReducer,
  readHighScore,
  writeHighScoreIfFaster,
  type Cell,
} from '../../game';
import { ORIENTATION, REF } from '../../canvas/reference';
import { PUZZLE_PORTRAIT as L } from '../../layout/portrait';
import { PUZZLE_CHROME } from '../../layout/chrome';
import { LandscapeFooter } from './LandscapeFooter';
import { CENTRED_ON_POINT, rectStyle, textStyle } from '../../layout/rect';
import { SpriteButton } from '../../ui/SpriteButton';
import { highScoreStore } from '../../storage/localStore';
import { Board } from './Board';
import { useAutoShuffle, useGameTimer, useMoveSettler, useWinDelay } from './hooks';
import { adoptPreparedArtwork, loadHomeArtwork, type LoadedArtwork } from './loadArtwork';
import { LoadingOverlay } from '../../ui/LoadingOverlay';
import { WinScreen } from '../WinScreen/WinScreen';
import styles from './PuzzleScreen.module.css';

const TUNING = BOARD_TUNING[ORIENTATION];
const CHROME = PUZZLE_CHROME[ORIENTATION];
const IS_LANDSCAPE = ORIENTATION === 'landscape';

interface PuzzleScreenProps {
  /**
   * An already-square image from the Crop screen. `null` means "pick one" — a
   * random collection piece, falling back to the bundled offline set.
   *
   * **Read only.** `App` created this blob URL and `App` revokes it (ADR-023);
   * this screen must not, or a remount adopts an already-revoked URL and the board
   * renders black.
   */
  readonly preparedArtwork?: { url: string; title: string } | null;
  /** START — the flow continues to image selection. */
  readonly onStart?: () => void;
  /** Home / back. */
  readonly onHome?: () => void;
  readonly onNewImage?: () => void;
  /**
   * Reports whether a game is in progress, which the Back rule needs: Back on the
   * Puzzle screen abandons a game mid-play but QUITS the app in attract mode
   * (docs/game-logic.md §6.3).
   */
  readonly onMidGameChange?: (midGame: boolean) => void;
  /**
   * Increment to force `ResetToLaunchMode()`: abandon the game, load a new random
   * artwork, return to attract mode.
   *
   * A token rather than a boolean because the owner needs to trigger a reset even
   * when nothing else about the props changed — Home mid-game with no prepared
   * artwork would otherwise be a silent no-op.
   */
  readonly resetToken?: number;
}

/**
 * Puzzle screen — the primary screen.
 *
 * Attract mode on entry: the board auto-shuffles once a second, START is shown,
 * and the footer buttons are non-interactive with their labels and icons at alpha
 * 0.3. The first tile or arrow tap switches to gameplay, which swaps START for
 * the timer and enables the footer.
 *
 * The home screen always shows one FIXED artwork (`FEATURED_HOME_ARTWORK`, client
 * directive 2026-08-04), falling back to a random collection piece and then to the
 * bundled textures — `loadHomeArtwork` decides, and never surfaces an error state,
 * because a kiosk showing a different picture beats a kiosk showing an error
 * (project-overview.md non-negotiable 4).
 */
export function PuzzleScreen({
  preparedArtwork = null,
  onStart,
  onHome,
  onNewImage,
  onMidGameChange,
  resetToken = 0,
}: PuzzleScreenProps = {}) {
  const [state, dispatch] = useReducer(gameReducer, INITIAL_GAME_STATE);
  const [artwork, setArtwork] = useState<LoadedArtwork | null>(null);
  const [previewHeld, setPreviewHeld] = useState(false);

  /** Bumped to request a fresh artwork + board. */
  const [buildToken, setBuildToken] = useState(0);
  const startGameplayImmediately = useRef(false);

  /**
   * True from the moment a build starts until the board AND its title are up.
   * Drives the loading scrim.
   */
  const [building, setBuilding] = useState(true);

  /**
   * Collection ids played this session, most recent first.
   *
   * Passed to the loader as an exclusion set so a new artwork cannot repeat one
   * the visitor has just had — "Play Again" handing back the piece they only just
   * solved is the complaint this exists for. A random pick over the 40 records on
   * page 1 makes an immediate repeat a 1-in-40 roll; excluding is a guarantee.
   *
   * A ref, not state: it must not trigger a render, and the load effect reads it
   * when it runs rather than closing over a snapshot.
   */
  const recentIds = useRef<number[]>([]);
  const RECENT_LIMIT = 12;

  // ---- Load artwork, then build a shuffled board ----------------------------
  /**
   * ONE effect owns the board's artwork.
   *
   * It used to be two: this one loaded the bundled image immediately and a second
   * swapped in a collection piece afterwards (ADR-043). Two owners for one piece
   * of state raced, and because the bundled load always carries a TITLE-LESS
   * identity, whenever it settled second it wiped the name off a perfectly good
   * collection artwork. That is what made the title appear only sometimes: the
   * warm Rust caches (ADR-025, ADR-030) return a cached page in ~1 ms, so the
   * supposedly slow load frequently won the race. Superseded by ADR-045.
   *
   * `RESET_TO_LAUNCH_MODE` compounds it — it returns `INITIAL_GAME_STATE`, which
   * clears `identity` while `artwork` (React state, not reducer state) keeps the
   * image, so Home left the picture up with no name until a build finished. Hence
   * the scrim: neither is shown until both are ready.
   */
  useEffect(() => {
    let cancelled = false;
    setBuilding(true);

    void (async () => {
      try {
        // The pinned featured artwork, then a random collection piece, then the
        // bundled set — `loadHomeArtwork` decides and never surfaces an error.
        const loaded = preparedArtwork
          ? adoptPreparedArtwork(preparedArtwork.url, preparedArtwork.title)
          : await loadHomeArtwork(Math.random, recentIds.current);

        if (cancelled) {
          loaded.release();
          return;
        }

        // Remember it so the next load cannot pick it again. Bounded, so a long
        // kiosk day cannot exhaust the 40-record pool and force the loader to
        // fall back to allowing repeats.
        if (loaded.collectionId !== undefined) {
          recentIds.current = [loaded.collectionId, ...recentIds.current].slice(0, RECENT_LIMIT);
        }

        setArtwork((previous) => {
          previous?.release();
          return loaded;
        });

        dispatch({
          type: 'BUILD',
          board: createShuffledBoard().board,
          identity: loaded.identity,
          highScoreSeconds: readHighScore(highScoreStore),
          // An image the visitor cropped goes straight into gameplay, as does
          // "Play Again"; a boot or "New Image" load starts in attract mode.
          ...(preparedArtwork || startGameplayImmediately.current
            ? { mode: 'gameplay' as const }
            : {}),
        });
        startGameplayImmediately.current = false;
      } catch (error) {
        // Even the bundled set failed, so an asset is missing — a packaging fault.
        console.error('[puzzle] artwork load failed', error);
      } finally {
        // Lifts the scrim even on failure. A spinner that never clears is worse
        // than a board with no picture, and staff keep their exit gesture.
        if (!cancelled) setBuilding(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [buildToken, preparedArtwork]);


  // ---- Effects that drive the state machine --------------------------------
  useGameTimer(state.timer.running, state.isSolved, dispatch);
  useMoveSettler(state.isAnimating, dispatch);
  useAutoShuffle(state, dispatch);
  useWinDelay(state.phase === 'revealing', dispatch);

  // Persist the record once, on the transition into `revealing`.
  useEffect(() => {
    if (state.phase !== 'revealing') return;

    const result = writeHighScoreIfFaster(highScoreStore, state.timer.elapsedSeconds);
    if (result.best !== state.highScoreSeconds) {
      dispatch({ type: 'HIGH_SCORE_LOADED', seconds: result.best });
    }
  }, [state.phase, state.timer.elapsedSeconds, state.highScoreSeconds]);

  // Debug/QA cheat: Ctrl+Shift+Alt+S instantly solves the board and shows the
  // win popup. `e.code === 'KeyS'` is used so the modifier combination cannot
  // remap the produced character. Capture phase so an input field cannot eat it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.altKey && event.code === 'KeyS') {
        event.preventDefault();
        dispatch({ type: 'SOLVE_CHEAT' });
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, []);

  // Release the blob URLs when the screen goes away.
  useEffect(() => () => artwork?.release(), [artwork]);

  /**
   * External `ResetToLaunchMode()`. The first render is skipped — mounting is
   * already a fresh start, and resetting here would load the artwork twice.
   */
  const lastResetToken = useRef(resetToken);
  useEffect(() => {
    if (resetToken === lastResetToken.current) return;
    lastResetToken.current = resetToken;
    startGameplayImmediately.current = false;
    dispatch({ type: 'RESET_TO_LAUNCH_MODE' });
    setBuildToken((token) => token + 1);
  }, [resetToken]);

  /**
   * A game counts as "in progress" once attract mode has been left and it is not
   * yet solved. Back abandons that game; in attract mode Back quits instead.
   */
  useEffect(() => {
    onMidGameChange?.(state.mode === 'gameplay' && !state.isSolved);
  }, [state.mode, state.isSolved, onMidGameChange]);

  // ---- Input ---------------------------------------------------------------
  const handleMove = useCallback(
    (cell: Cell) => {
      // ExitLaunchMode() runs first, then the input gate — the first tap must
      // leave attract mode even though attract mode itself never blocks input.
      if (!canAcceptInput(state)) return;
      dispatch({ type: 'MOVE_STARTED', cell, source: 'player' });
    },
    [state],
  );

  /**
   * Re-shuffle the artwork already on the board into a fresh game.
   *
   * Backs BOTH the footer's RESET and the win screen's "Play Again" — the client
   * specified them as the same action (2026-07-31): keep the artwork the visitor
   * just played, re-shuffle it, go straight into gameplay.
   *
   * It also hides the win popup for free, because `BUILD` spreads
   * `INITIAL_GAME_STATE` and so resets `phase` to `playing`, and the popup renders
   * on `phase === 'won'`.
   *
   * **No artwork load and no `buildToken` bump**, which is the point. "Play Again"
   * used to dispatch `RESET_TO_LAUNCH_MODE` and bump the token, which cleared the
   * board, put the screen back in attract mode and raised the build scrim while a
   * NEW artwork was fetched — that is the "it goes to the home screen" the client
   * saw in landscape. It happens in portrait too; landscape just made it obvious.
   *
   * **Diverges from Unity deliberately.** `ResetToLaunchMode(true)`
   * (game-logic §6.2) loads a new image straight into gameplay. The reducer keeps
   * that capability and its tests; this screen no longer uses it for Play Again.
   */
  const reshuffleSameArtwork = useCallback(() => {
    if (!state.board) return;
    dispatch({
      type: 'BUILD',
      board: createShuffledBoard().board,
      identity: state.identity,
      highScoreSeconds: state.highScoreSeconds,
      mode: 'gameplay',
    });
  }, [state.board, state.identity, state.highScoreSeconds]);

  const handleNewImage = useCallback(() => {
    if (onNewImage) {
      onNewImage();
    } else {
      startGameplayImmediately.current = false;
      dispatch({ type: 'RESET_TO_LAUNCH_MODE' });
      setBuildToken((token) => token + 1);
    }
  }, [onNewImage]);

  const handleStart = useCallback(() => {
    // Unity's START leaves attract mode AND navigates to image selection. With no
    // router yet, navigation is delegated; without a handler it just starts play.
    dispatch({ type: 'EXIT_LAUNCH_MODE' });
    onStart?.();
  }, [onStart]);

  // ---- Derived -------------------------------------------------------------
  const isAttract = state.mode === 'launch';
  const footerEnabled = !isAttract;
  const geometry = computeBoardGeometry(REF.w, REF.h, TUNING);
  const board = boardRect(REF.w, REF.h, geometry, TUNING);
  const previewVisible = previewHeld || state.previewVisible;

  return (
    <div className={styles.screen} style={rectStyle(L.screen.rect)}>
      <img className={styles.background} src={CHROME.background} alt="" draggable={false} />

      <img
        className={styles.logo}
        style={rectStyle(CHROME.appLogoRect)}
        src={CHROME.appLogoSprite}
        alt="Museum of Art & Photography"
        draggable={false}
      />

      <SpriteButton
        rect={CHROME.backButtonRect}
        sprite={CHROME.backButtonSprite}
        ariaLabel="Home"
        onPress={onHome ?? handleNewImage}
      />

      <Board
        state={state}
        artworkUrl={artwork?.url ?? null}
        parentWidth={REF.w}
        parentHeight={REF.h}
        onTileTap={handleMove}
        onArrowTap={handleMove}
      />

      {/* Footer ----------------------------------------------------------------
          Portrait positions its five controls absolutely from fractional anchors;
          landscape lays the same controls out with a HorizontalLayoutGroup. That
          is a difference in MECHANISM, so the two footers are separate components
          rather than one riddled with conditionals (ADR-019). */}
      {IS_LANDSCAPE ? (
        <LandscapeFooter
          isAttract={isAttract}
          footerEnabled={footerEnabled}
          timerText={formatTime(state.timer.elapsedSeconds)}
          highScoreText={formatHighScore(state.highScoreSeconds)}
          onStart={handleStart}
          onReset={reshuffleSameArtwork}
          onNewImage={handleNewImage}
          onPreviewStart={() => setPreviewHeld(true)}
          onPreviewEnd={() => setPreviewHeld(false)}
        />
      ) : (
        <>
      <div className={styles.caption} style={rectStyle(L.caption.rect)}>
        <span style={{ ...CENTRED_ON_POINT, ...textStyle(L.caption.text) }}>
          {L.caption.text.text}
        </span>
      </div>

      {/* START and the timer are mutually exclusive (SetStartButton/SetTimer). */}
      {isAttract ? (
        <SpriteButton
          rect={L.startButton.rect}
          sprite={L.startButton.sprite}
          pressedSprite={L.startButton.pressedSprite}
          label={L.startButton.label}
          onPress={handleStart}
        />
      ) : (
        <div className={styles.timer} style={rectStyle(L.timer.rect)}>
          {/* Plate is CSS, not `L.timer.sprite` — see .timerBackground. */}
          <div className={styles.timerBackground} />
          <span className={styles.timerValue} style={textStyle(L.timer.label)}>
            {formatTime(state.timer.elapsedSeconds)}
          </span>
        </div>
      )}

      {/* High-score badge. Circle_9Sliced is 9-sliced with a uniform 255 px
          border AND tinted #67797F. `border-image` cannot be tinted, so the
          sprite is used as a 9-sliced MASK over a solid fill instead. */}
      <div className={styles.highScore} style={rectStyle(L.highScore.rect)}>
        <div className={styles.highScoreFill} style={{ backgroundColor: L.highScore.tint }} />
        <div
          className={styles.highScoreTitle}
          style={{ ...rectStyle(L.highScore.titleRect), ...textStyle(L.highScore.title) }}
        >
          {L.highScore.title.text}
        </div>
        <div
          className={styles.highScoreValue}
          style={{ ...rectStyle(L.highScore.valueRect), ...textStyle(L.highScore.value) }}
        >
          {formatHighScore(state.highScoreSeconds)}
        </div>
      </div>

      <SpriteButton
        rect={L.footerButtons.reset.rect}
        sprite={L.footerButtons.reset.sprite}
        pressedSprite={L.footerButtons.reset.pressedSprite}
        label={L.footerButtons.reset.label}
        icon={L.footerButtons.reset.icon}
        disabled={!footerEnabled}
        onPress={reshuffleSameArtwork}
      />

      {/* Preview is HOLD-to-show, not a toggle: UIPressHandler fires
          TogglePreview(true) on pointer-down and (false) on pointer-up. Unlike
          the press offset, that handler also treats pointer EXIT as a release. */}
      <SpriteButton
        rect={L.footerButtons.preview.rect}
        sprite={L.footerButtons.preview.sprite}
        pressedSprite={L.footerButtons.preview.pressedSprite}
        label={L.footerButtons.preview.label}
        icon={L.footerButtons.preview.icon}
        disabled={!footerEnabled}
        onPressStart={() => setPreviewHeld(true)}
        onPressEnd={() => setPreviewHeld(false)}
        releaseOnExit
      />

      <SpriteButton
        rect={L.footerButtons.newImage.rect}
        sprite={L.footerButtons.newImage.sprite}
        pressedSprite={L.footerButtons.newImage.pressedSprite}
        label={L.footerButtons.newImage.label}
        icon={L.footerButtons.newImage.icon}
        disabled={!footerEnabled}
        onPress={handleNewImage}
      />
        </>
      )}

      {/* Win screen. An overlay, not a routed screen: the board and the preview
          must stay visible behind it, which is why its scene background is at
          alpha 0. The reducer has already run the reveal and the 1 s delay by the
          time `phase` reaches 'won'. */}
      {state.phase === 'won' ? (
        <WinScreen
          elapsedSeconds={state.timer.elapsedSeconds}
          highScoreSeconds={state.highScoreSeconds}
          onPlayAgain={reshuffleSameArtwork}
        />
      ) : null}

      {/* Preview overlay. MatchPreviewToBoard resizes the panel to the board rect
          at runtime, so it overlays the board — not the whole screen, despite the
          scene authoring it full-stretch. The image uses AspectRatioFitter
          FitInParent (m_AspectMode 3) → object-fit: contain. */}
      {previewVisible && artwork ? (
        <div
          className={styles.previewPanel}
          style={{
            left: `${board.left}px`,
            top: `${board.top}px`,
            width: `${board.width}px`,
            height: `${board.height}px`,
          }}
        >
          <img className={styles.previewImage} src={artwork.url} alt="" draggable={false} />
        </div>
      ) : null}

      {/* Build scrim. Rendered LAST and z-index 40, so it covers the board, the
          preview panel (10) and the win popup (20) — the screen is not ready and
          nothing behind it should be reachable. Lifts only once the artwork, the
          board and the title are all in place. */}
      {building ? <LoadingOverlay label="Building the puzzle..." /> : null}
    </div>
  );
}

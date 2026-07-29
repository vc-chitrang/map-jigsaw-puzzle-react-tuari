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
import { REF } from '../../canvas/reference';
import { PUZZLE_PORTRAIT as L } from '../../layout/portrait';
import { CENTRED_ON_POINT, rectStyle, textStyle } from '../../layout/rect';
import { SpriteButton } from '../../ui/SpriteButton';
import { highScoreStore } from '../../storage/localStore';
import { Board } from './Board';
import { useAutoShuffle, useGameTimer, useMoveSettler, useWinDelay } from './hooks';
import { adoptPreparedArtwork, loadRandomArtwork, type LoadedArtwork } from './loadArtwork';
import styles from './PuzzleScreen.module.css';

const TUNING = BOARD_TUNING.portrait;

interface PuzzleScreenProps {
  /**
   * An already-square image from the Crop screen. `null` means "pick one" — a
   * random collection piece, falling back to the bundled offline set.
   *
   * Ownership of the blob URL transfers here: this screen revokes it when the
   * artwork is replaced or the screen unmounts.
   */
  readonly preparedArtwork?: { url: string; title: string } | null;
  /** START — the flow continues to image selection. */
  readonly onStart?: () => void;
  /** Home / back. */
  readonly onHome?: () => void;
}

/**
 * Puzzle screen — the primary screen.
 *
 * Attract mode on entry: the board auto-shuffles once a second, START is shown,
 * and the footer buttons are non-interactive with their labels and icons at alpha
 * 0.3. The first tile or arrow tap switches to gameplay, which swaps START for
 * the timer and enables the footer.
 *
 * Artwork comes from the collection when it is reachable and from the bundled
 * textures when it is not — `loadRandomArtwork` decides, and never surfaces an
 * error state, because a kiosk showing a different picture beats a kiosk showing
 * an error (project-overview.md non-negotiable 4).
 */
export function PuzzleScreen({
  preparedArtwork = null,
  onStart,
  onHome,
}: PuzzleScreenProps = {}) {
  const [state, dispatch] = useReducer(gameReducer, INITIAL_GAME_STATE);
  const [artwork, setArtwork] = useState<LoadedArtwork | null>(null);
  const [previewHeld, setPreviewHeld] = useState(false);

  /** Bumped to request a fresh artwork + board. */
  const [buildToken, setBuildToken] = useState(0);
  const startGameplayImmediately = useRef(false);

  // ---- Load artwork, then build a shuffled board ----------------------------
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const loaded = preparedArtwork
          ? adoptPreparedArtwork(preparedArtwork.url, preparedArtwork.title)
          : await loadRandomArtwork();

        if (cancelled) {
          loaded.release();
          return;
        }

        setArtwork((previous) => {
          previous?.release();
          return loaded;
        });

        dispatch({
          type: 'BUILD',
          board: createShuffledBoard().board,
          identity: loaded.identity,
          highScoreSeconds: readHighScore(highScoreStore, loaded.identity),
          // An image the visitor cropped goes straight into gameplay, as does
          // "Play Again"; a boot or "New Image" load starts in attract mode.
          ...(preparedArtwork || startGameplayImmediately.current
            ? { mode: 'gameplay' as const }
            : {}),
        });
        startGameplayImmediately.current = false;
      } catch (error) {
        // Both sources failed, so a bundled asset is missing — a packaging fault.
        console.error('[puzzle] artwork load failed', error);
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

    const result = writeHighScoreIfFaster(
      highScoreStore,
      state.timer.elapsedSeconds,
      state.identity,
    );
    if (result.best !== state.highScoreSeconds) {
      dispatch({ type: 'HIGH_SCORE_LOADED', seconds: result.best });
    }
  }, [state.phase, state.timer.elapsedSeconds, state.identity, state.highScoreSeconds]);

  // Release the blob URLs when the screen goes away.
  useEffect(() => () => artwork?.release(), [artwork]);

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

  const handleReset = useCallback(() => {
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
    startGameplayImmediately.current = false;
    dispatch({ type: 'RESET_TO_LAUNCH_MODE' });
    setBuildToken((token) => token + 1);
  }, []);

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
      <img className={styles.background} src={L.screen.background} alt="" draggable={false} />

      <img
        className={styles.logo}
        style={rectStyle(L.appLogo.rect)}
        src={L.appLogo.sprite}
        alt="Museum of Art & Photography"
        draggable={false}
      />

      {/* Home. Navigation lands in Phase 5; the hit target exists now so the
          geometry can be diffed against the Unity capture. */}
      <SpriteButton
        rect={L.backButton.rect}
        sprite={L.backButton.sprite}
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

      {/* Footer -------------------------------------------------------------- */}
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
          <img src={L.timer.sprite} alt="" className={styles.timerBackground} draggable={false} />
          <span className={styles.timerValue} style={textStyle(L.timer.label)}>
            {formatTime(state.timer.elapsedSeconds)}
          </span>
        </div>
      )}

      {/* High-score badge. Circle_9Sliced is 9-sliced with a uniform 255 px
          border AND tinted #67797F. `border-image` cannot be tinted, so the
          sprite is used as a 9-sliced MASK over a solid fill instead. */}
      <div className={styles.highScore} style={rectStyle(L.highScore.rect)}>
        <div
          className={styles.highScoreFill}
          style={{
            backgroundColor: L.highScore.tint,
            WebkitMaskBoxImage: `url("${L.highScore.sprite}") ${L.highScore.sliceBorderPx} fill stretch`,
          }}
        />
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
        onPress={handleReset}
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
    </div>
  );
}

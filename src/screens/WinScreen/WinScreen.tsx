import { formatHighScore, formatTime } from '../../game';
import { ORIENTATION } from '../../canvas/reference';
import { WIN_LAYOUT } from '../../layout/screens';
import { rectStyle, textStyle } from '../../layout/rect';
import { SpriteButton } from '../../ui/SpriteButton';
import styles from './WinScreen.module.css';

/**
 * Win screen.
 *
 * An OVERLAY, not a full screen: its root background is transparent in the scene
 * (`Background_Portrait.png` at alpha 0), so the solved board and the full-image
 * preview stay visible behind the popup.
 *
 * The reducer already owns the sequencing — the winning move sets `phase:
 * 'revealing'`, the 9th slice appears, and `WIN_DELAY_ELAPSED` fires 1 s later.
 * This component only renders and wires Play Again.
 *
 * Geometry is per-orientation data (`layout/win.ts`, `layout/win-landscape.ts`);
 * the landscape popup is smaller and every font size differs.
 */

const W = WIN_LAYOUT[ORIENTATION];

interface WinScreenProps {
  /** This run, in seconds. */
  readonly elapsedSeconds: number;
  /** Best for this artwork, or -1 for no record. */
  readonly highScoreSeconds: number;
  /** New image, straight into gameplay — skips attract mode. */
  readonly onPlayAgain: () => void;
}

export function WinScreen({ elapsedSeconds, highScoreSeconds, onPlayAgain }: WinScreenProps) {
  return (
    <div className={styles.screen} style={rectStyle(W.screenRect)}>
      <div className={styles.popup} style={rectStyle(W.popup.rect)}>
        {/* 9-sliced pill, then the tinted pattern over it, then the flat wash.
            Same mask-border trick as the high-score badge: `border-image` cannot
            be tinted, `-webkit-mask-box-image` can. */}
        <div
          className={styles.mask}
          style={{
            backgroundColor: W.popup.background,
            WebkitMaskBoxImage: `url("${W.popup.maskSprite}") ${W.popup.maskSliceBorderPx} fill stretch`,
          }}
        />
        <div
          className={styles.pattern}
          style={{
            backgroundColor: W.popup.patternColour,
            WebkitMaskBoxImage: `url("${W.popup.maskSprite}") ${W.popup.maskSliceBorderPx} fill stretch`,
          }}
        />

        {/* ---- "You Win!" ---- */}
        <div
          className={styles.youWin}
          style={{ ...rectStyle(W.youWin.rect), background: W.youWin.background }}
        >
          <span className={styles.youWinText} style={textStyle(W.youWin.text)}>
            {W.youWin.text.text}
          </span>
        </div>

        {/* ---- Your score ---- */}
        <span
          className={styles.scoreLabel}
          style={{ ...rectStyle(W.yourScore.labelRect), ...textStyle(W.yourScore.label) }}
        >
          {W.yourScore.label.text}
        </span>
        <div
          className={styles.scoreBox}
          style={{ ...rectStyle(W.yourScore.boxRect), background: W.yourScore.boxBackground }}
        >
          <span className={styles.scoreValue} style={textStyle(W.yourScore.value)}>
            {formatTime(elapsedSeconds)}
          </span>
        </div>

        {/* ---- High score ---- */}
        <span
          className={styles.scoreLabel}
          style={{ ...rectStyle(W.highScore.labelRect), ...textStyle(W.highScore.label) }}
        >
          {W.highScore.label.text}
        </span>
        <div
          className={styles.scoreBox}
          style={{ ...rectStyle(W.highScore.boxRect), background: W.highScore.boxBackground }}
        >
          <span className={styles.scoreValue} style={textStyle(W.highScore.value)}>
            {formatHighScore(highScoreSeconds)}
          </span>
        </div>

        <SpriteButton
          rect={W.playAgain.rect}
          sprite={W.playAgain.sprite}
          pressedSprite={W.playAgain.pressedSprite}
          label={W.playAgain.label}
          onPress={onPlayAgain}
        />
      </div>
    </div>
  );
}

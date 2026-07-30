import { PUZZLE_LANDSCAPE as L } from '../../layout/landscape';
import { rectStyle, textStyle } from '../../layout/rect';
import { SpriteButton } from '../../ui/SpriteButton';
import styles from './LandscapeFooter.module.css';

/**
 * Landscape footer.
 *
 * A FLEX ROW, because `ControlButtons_00` carries a `HorizontalLayoutGroup`
 * (spacing 50, LowerCenter, force-expand) rather than absolute anchors. Portrait
 * positions the same five controls absolutely, which is why the two footers are
 * separate components instead of one with a pile of conditionals.
 *
 * Order in the row follows the scene's child order: timer/START, high score,
 * reset, preview, new image.
 */

interface LandscapeFooterProps {
  readonly isAttract: boolean;
  readonly footerEnabled: boolean;
  readonly timerText: string;
  readonly highScoreText: string;
  readonly onStart: () => void;
  readonly onReset: () => void;
  readonly onNewImage: () => void;
  readonly onPreviewStart: () => void;
  readonly onPreviewEnd: () => void;
}

/** Fills its flex slot; the row, not a rect, decides where it lands. */
const inFlow = { position: 'relative' as const, flex: '0 0 auto' };

export function LandscapeFooter({
  isAttract,
  footerEnabled,
  timerText,
  highScoreText,
  onStart,
  onReset,
  onNewImage,
  onPreviewStart,
  onPreviewEnd,
}: LandscapeFooterProps) {
  return (
    <div className={styles.footer} style={rectStyle(L.footerRect)}>
      <span className={styles.caption} style={{ ...rectStyle(L.caption.rect), ...textStyle(L.caption.text) }}>
        {L.caption.text.text}
      </span>

      <div className={styles.controls} style={{ ...rectStyle(L.controls.rect), gap: `${L.controls.gapPx}px` }}>
        {/* START and the timer are mutually exclusive, exactly as in portrait. */}
        {isAttract ? (
          <SpriteButton
            sprite={L.startButton.sprite}
            pressedSprite={L.startButton.pressedSprite}
            label={L.startButton.label}
            onPress={onStart}
            style={{ ...inFlow, width: `${L.startButton.size.x}px`, height: `${L.startButton.size.y}px` }}
          />
        ) : (
          <div
            className={styles.timer}
            style={{ ...inFlow, width: `${L.timer.size.x}px`, height: `${L.timer.size.y}px` }}
          >
            <img src={L.timer.sprite} alt="" className={styles.timerBackground} draggable={false} />
            <span className={styles.timerValue} style={textStyle(L.timer.label)}>
              {timerText}
            </span>
          </div>
        )}

        {/* High-score badge: a flat fill in landscape, not the 9-sliced sprite. */}
        <div
          className={styles.highScore}
          style={{
            ...inFlow,
            width: `${L.highScore.size.x}px`,
            height: `${L.highScore.size.y}px`,
            background: L.highScore.background,
          }}
        >
          <span
            className={styles.highScoreTitle}
            style={{ ...rectStyle(L.highScore.titleRect), ...textStyle(L.highScore.title) }}
          >
            {L.highScore.title.text}
          </span>
          <span
            className={styles.highScoreValue}
            style={{ ...rectStyle(L.highScore.valueRect), ...textStyle(L.highScore.value) }}
          >
            {highScoreText}
          </span>
        </div>

        {(
          [
            { key: 'reset', spec: L.footerButtons.reset, onPress: onReset, hold: false },
            { key: 'preview', spec: L.footerButtons.preview, onPress: undefined, hold: true },
            { key: 'newImage', spec: L.footerButtons.newImage, onPress: onNewImage, hold: false },
          ] as const
        ).map((button) => (
          <SpriteButton
            key={button.key}
            sprite={button.spec.sprite}
            pressedSprite={button.spec.pressedSprite}
            label={button.spec.label}
            icon={button.spec.icon}
            disabled={!footerEnabled}
            {...(button.hold
              ? { onPressStart: onPreviewStart, onPressEnd: onPreviewEnd, releaseOnExit: true }
              : { onPress: button.onPress })}
            style={{ ...inFlow, width: `${button.spec.size.x}px`, height: `${button.spec.size.y}px` }}
          />
        ))}
      </div>
    </div>
  );
}

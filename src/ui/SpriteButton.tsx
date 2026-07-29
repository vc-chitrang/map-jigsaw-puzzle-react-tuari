import { useCallback, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { rectStyle, textStyle, type LayoutRect } from '../layout/rect';
import type { TextSpec } from '../layout/portrait';
import styles from './SpriteButton.module.css';

/**
 * Unity `Button` with `transition = SpriteSwap`, plus `ButtonPressOffset`.
 *
 * Three behaviours have to match exactly (ADR-004, ADR-005, ui-spec §8.3/§9):
 *
 * 1. **Sprite swap** — the background image changes while held.
 * 2. **Press offset** — the label AND the icon shift by `(−10, −10)` px in Unity
 *    coordinates, i.e. left and DOWN, so `translate(-10px, +10px)` in CSS.
 * 3. **Disabled** — label and icon drop to alpha 0.3. The background keeps its
 *    normal sprite and RGB is untouched.
 *
 * Press state is driven by `pointerdown`/`pointerup` with `setPointerCapture`,
 * NOT by `:active` and NOT by `pointerleave`. Unity's `Selectable` keeps a button
 * pressed while held even after the pointer leaves it, and releases on pointer-up
 * wherever that happens. Pointer capture reproduces that; `pointerleave` would
 * desync the label from the background sprite.
 *
 * TWO PRESS SEMANTICS COEXIST in this UI, so both are supported here:
 *
 * * `onPress` — a click: fires on pointer-up **over** the button. Used by every
 *   footer button and START.
 * * `onPressStart` / `onPressEnd` — hold-to-act, matching `UIPressHandler`, which
 *   the Preview button uses. That handler *does* treat pointer exit as a release
 *   (`releaseOnExit`), even though the pressed sprite stays put.
 */

interface IconSpec {
  readonly sprite: string;
  readonly rect: LayoutRect;
}

interface SpriteButtonProps {
  readonly rect: LayoutRect;
  readonly sprite: string;
  readonly pressedSprite?: string;
  readonly label?: TextSpec;
  readonly icon?: IconSpec;
  readonly disabled?: boolean;
  /** Click semantics: pointer-up over the button. */
  readonly onPress?: () => void;
  /** Hold semantics (`UIPressHandler.onPressDown`). */
  readonly onPressStart?: () => void;
  /** Hold semantics (`UIPressHandler.onPressUp`). */
  readonly onPressEnd?: () => void;
  /** `UIPressHandler` releases on pointer exit; `Selectable` does not. */
  readonly releaseOnExit?: boolean;
  readonly ariaLabel?: string;
  readonly children?: ReactNode;
  readonly className?: string;
}

function isInsideBounds(element: HTMLElement, clientX: number, clientY: number): boolean {
  const bounds = element.getBoundingClientRect();
  return (
    clientX >= bounds.left &&
    clientX <= bounds.right &&
    clientY >= bounds.top &&
    clientY <= bounds.bottom
  );
}

export function SpriteButton({
  rect,
  sprite,
  pressedSprite,
  label,
  icon,
  disabled = false,
  onPress,
  onPressStart,
  onPressEnd,
  releaseOnExit = false,
  ariaLabel,
  children,
  className,
}: SpriteButtonProps) {
  const [pressed, setPressed] = useState(false);
  const activePointer = useRef<number | null>(null);
  /** Whether `onPressStart` is currently outstanding, so it is ended exactly once. */
  const holding = useRef(false);

  const endHold = useCallback(() => {
    if (!holding.current) return;
    holding.current = false;
    onPressEnd?.();
  }, [onPressEnd]);

  const reset = useCallback(() => {
    activePointer.current = null;
    setPressed(false);
    endHold();
  }, [endHold]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      activePointer.current = event.pointerId;
      // Capture so we keep receiving events — and stay visually pressed — even
      // once the finger slides off the button. Best-effort: it throws if the
      // pointer has already gone, and the press must still register.
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* fall through to the un-captured path */
      }
      setPressed(true);

      if (onPressStart) {
        holding.current = true;
        onPressStart();
      }
    },
    [disabled, onPressStart],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (!releaseOnExit || !holding.current) return;
      if (activePointer.current !== event.pointerId) return;
      if (!isInsideBounds(event.currentTarget, event.clientX, event.clientY)) endHold();
    },
    [endHold, releaseOnExit],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (activePointer.current !== event.pointerId) return;

      const inside = isInsideBounds(event.currentTarget, event.clientX, event.clientY);
      reset();

      // Unity fires the click only when the pointer is released OVER the button.
      if (!disabled && inside) onPress?.();
    },
    [disabled, onPress, reset],
  );

  const background = pressed && pressedSprite ? pressedSprite : sprite;

  // Only the contents move; the background sprite does not.
  const contentTransform: CSSProperties | undefined = pressed
    ? { transform: 'translate(calc(-1 * var(--press-offset)), var(--press-offset))' }
    : undefined;

  return (
    <button
      type="button"
      className={[styles.button, disabled ? styles.disabled : '', className]
        .filter(Boolean)
        .join(' ')}
      style={{ ...rectStyle(rect), backgroundImage: `url("${background}")` }}
      disabled={disabled}
      aria-label={ariaLabel ?? label?.text}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={reset}
      onLostPointerCapture={reset}
    >
      {icon ? (
        <img
          className={styles.icon}
          style={{ ...rectStyle(icon.rect), ...contentTransform }}
          src={icon.sprite}
          alt=""
          draggable={false}
        />
      ) : null}

      {label ? (
        <span className={styles.label} style={{ ...textStyle(label), ...contentTransform }}>
          {label.text}
        </span>
      ) : null}

      {children}
    </button>
  );
}

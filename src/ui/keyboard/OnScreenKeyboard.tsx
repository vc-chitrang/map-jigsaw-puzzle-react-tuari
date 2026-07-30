import { useCallback, useRef, useState } from 'react';
import {
  KEYBOARD_METRICS as M,
  KEY_ROWS,
  applyKey,
  keyFace,
  keyboardWidth,
  type KeyDef,
} from './layout';
import styles from './OnScreenKeyboard.module.css';

/**
 * In-app on-screen keyboard (ADR-006).
 *
 * White and brand-styled, drawn inside the scaled canvas so it scales with the
 * rest of the UI. Replaces `TabTip.exe`/`osk.exe`, which could not be themed
 * reliably, gave no dependable open/close state, and appeared as separate OS
 * windows with their own close buttons — a way out of the kiosk.
 *
 * THE KEYBOARD DOES NOT KNOW THE TEXT. `onChange` takes an UPDATER, not a string.
 *
 * That is deliberate. The first version took the current value as a prop and
 * computed `value + char`. Typing four letters quickly put all four presses in one
 * React batch, every one of them read the same stale `value`, and "raga" arrived as
 * "a". Passing an updater means each press composes on the freshest text, however
 * fast a visitor types — and it removes the duplicate source of truth entirely.
 */

interface OnScreenKeyboardProps {
  readonly onChange: (updater: (previous: string) => string) => void;
  readonly onSubmit: () => void;
  readonly onClose: () => void;
}

export function OnScreenKeyboard({ onChange, onSubmit, onClose }: OnScreenKeyboardProps) {
  const [shifted, setShifted] = useState(false);
  /** Mirror, so a press reads the current layer even inside a batch. */
  const shiftedRef = useRef(false);

  const applyShift = useCallback((next: boolean) => {
    shiftedRef.current = next;
    setShifted(next);
  }, []);

  const press = useCallback(
    (key: KeyDef) => {
      const action = key.action;
      const wasShifted = shiftedRef.current;

      // Text-producing keys compose on the previous value.
      if (action.kind === 'char' || action.kind === 'space' || action.kind === 'backspace') {
        onChange((previous) => applyKey(action, previous, wasShifted).text);
      }

      // Flags and the next shift layer do not depend on the text, so an empty
      // string is enough to read them off the same pure function.
      const flags = applyKey(action, '', wasShifted);
      applyShift(flags.shifted);
      if (flags.submit) onSubmit();
      if (flags.close) onClose();
    },
    [applyShift, onChange, onClose, onSubmit],
  );

  return (
    <div
      className={styles.keyboard}
      style={{
        width: `${keyboardWidth()}px`,
        padding: `${M.padding}px`,
        gap: `${M.gap}px`,
        borderRadius: `${M.radius}px`,
      }}
      // Taps inside the keyboard must never reach the dismiss handler.
      onPointerDown={(event) => event.stopPropagation()}
      role="group"
      aria-label="On-screen keyboard"
    >
      {KEY_ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className={styles.row} style={{ gap: `${M.gap}px` }}>
          {row.map((key) => {
            const isChar = key.action.kind === 'char';
            const span = key.span ?? 1;

            return (
              <button
                key={`${rowIndex}-${key.label}`}
                type="button"
                className={[
                  styles.key,
                  isChar ? '' : styles.actionKey,
                  key.action.kind === 'shift' && shifted ? styles.keyActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  width: `${span * M.keyWidth + (span - 1) * M.gap}px`,
                  height: `${M.keyHeight}px`,
                  borderRadius: `${M.radius}px`,
                  fontSize: `${isChar ? M.fontSizePx : M.actionFontSizePx}px`,
                }}
                // Fire on pointer-down: a kiosk keyboard should feel immediate, and
                // there is no drag gesture on a key worth preserving.
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  press(key);
                }}
                aria-label={key.action.kind === 'char' ? keyFace(key, shifted) : key.label}
              >
                {keyFace(key, shifted)}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

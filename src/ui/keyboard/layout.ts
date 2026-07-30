/**
 * On-screen keyboard layout and key handling — pure, no React, no DOM.
 *
 * NO UNITY GEOMETRY EXISTS FOR THIS. The Unity build launches the Windows
 * keyboard (`TabTip.exe`/`osk.exe`) via P/Invoke, so there is nothing in the scene
 * to transcribe. ADR-006 replaces that with an in-app keyboard because every
 * keyboard defect in the project traced to not owning the keyboard: `osk.exe`
 * ignores the light theme, `TabTip` has no reliable open/close state and its
 * toggle double-fired, and both are separate OS windows with their own close
 * affordances — a kiosk-escape route.
 *
 * The layout below is therefore a DESIGN DECISION, not a transcription. It is
 * sized in reference px for a 2160-wide canvas and styled from the brand tokens.
 */

/** A key's behaviour. */
export type KeyAction =
  | { kind: 'char'; value: string }
  | { kind: 'backspace' }
  | { kind: 'space' }
  | { kind: 'shift' }
  | { kind: 'submit' }
  | { kind: 'close' };

export interface KeyDef {
  /** Face for the unshifted layer. */
  readonly label: string;
  /** Face for the shifted layer. Defaults to `label` uppercased. */
  readonly shiftLabel?: string;
  readonly action: KeyAction;
  /** Width as a multiple of one standard key. Default 1. */
  readonly span?: number;
}

const char = (value: string): KeyDef => ({ label: value, action: { kind: 'char', value } });

/**
 * QWERTY, digits row first. Search is the only text entry in this app (the
 * collection search field and the five filter popups), so there is no symbol
 * layer — an artwork search never needs one, and every extra layer is another
 * thing a visitor can get lost in.
 */
export const KEY_ROWS: readonly (readonly KeyDef[])[] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(char),
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'].map(char),
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'].map(char),
  [
    { label: '⇧', action: { kind: 'shift' }, span: 1.5 },
    ...['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(char),
    { label: '⌫', action: { kind: 'backspace' }, span: 1.5 },
  ],
  [
    { label: 'Close', action: { kind: 'close' }, span: 2 },
    { label: 'space', action: { kind: 'space' }, span: 5 },
    { label: 'Search', action: { kind: 'submit' }, span: 2 },
  ],
];

/** Face to draw for a key on the current layer. */
export function keyFace(key: KeyDef, shifted: boolean): string {
  if (!shifted) return key.label;
  if (key.shiftLabel !== undefined) return key.shiftLabel;
  return key.action.kind === 'char' ? key.label.toUpperCase() : key.label;
}

export interface KeyResult {
  readonly text: string;
  /** Shift is one-shot: it applies to the next character then clears. */
  readonly shifted: boolean;
  /** The field should be submitted. */
  readonly submit: boolean;
  /** The keyboard should close. */
  readonly close: boolean;
}

/**
 * Apply a key to the current text.
 *
 * Pure so the whole key-handling contract is unit-testable without rendering:
 * shift being one-shot, backspace on empty text being a no-op, and so on.
 */
export function applyKey(action: KeyAction, text: string, shifted: boolean): KeyResult {
  const base = { text, shifted, submit: false, close: false };

  switch (action.kind) {
    case 'char': {
      const value = shifted ? action.value.toUpperCase() : action.value;
      // Shift clears after one character, like a phone keyboard.
      return { ...base, text: text + value, shifted: false };
    }

    case 'space':
      return { ...base, text: `${text} `, shifted: false };

    case 'backspace':
      // slice(0, -1) on '' yields '', so empty text is naturally a no-op.
      return { ...base, text: text.slice(0, -1) };

    case 'shift':
      return { ...base, shifted: !shifted };

    case 'submit':
      return { ...base, submit: true };

    case 'close':
      return { ...base, close: true };

    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

/** Keyboard geometry, in reference px. Design values (see the header note). */
export const KEYBOARD_METRICS = {
  /** Standard key size. */
  keyWidth: 168,
  keyHeight: 148,
  gap: 14,
  padding: 32,
  fontSizePx: 62,
  /** Modifier and action keys read as secondary. */
  actionFontSizePx: 44,
  radius: 16,
} as const;

/** Total width of the widest row, so the panel can be centred. */
export function keyboardWidth(): number {
  const { keyWidth, gap, padding } = KEYBOARD_METRICS;
  const widest = Math.max(
    ...KEY_ROWS.map((row) => {
      const spans = row.reduce((total, key) => total + (key.span ?? 1), 0);
      return spans * keyWidth + (row.length - 1) * gap;
    }),
  );
  return widest + padding * 2;
}

export function keyboardHeight(): number {
  const { keyHeight, gap, padding } = KEYBOARD_METRICS;
  return KEY_ROWS.length * keyHeight + (KEY_ROWS.length - 1) * gap + padding * 2;
}

/**
 * Tap-versus-drag threshold for dismissing the keyboard.
 *
 * `HandleKeyboardDismiss`: on pointer UP, if the pointer moved less than 15 px it
 * was a tap, not a scroll, and the keyboard closes (docs/ui-spec.md §5).
 */
export const TAP_SLOP_PX = 15;

/** True when a pointer gesture counts as a tap rather than a drag. */
export function isTap(startX: number, startY: number, endX: number, endY: number): boolean {
  const dx = endX - startX;
  const dy = endY - startY;
  return Math.hypot(dx, dy) < TAP_SLOP_PX;
}

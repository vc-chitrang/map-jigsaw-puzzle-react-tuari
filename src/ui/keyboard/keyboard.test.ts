import { describe, expect, it } from 'vitest';
import {
  KEYBOARD_METRICS,
  KEY_ROWS,
  TAP_SLOP_PX,
  applyKey,
  isTap,
  keyFace,
  keyboardHeight,
  keyboardWidth,
} from './layout';

describe('applyKey — character entry', () => {
  it('appends the character', () => {
    expect(applyKey({ kind: 'char', value: 'a' }, 'rag', false)).toMatchObject({ text: 'raga' });
  });

  it('uppercases while shifted', () => {
    expect(applyKey({ kind: 'char', value: 'a' }, '', true)).toMatchObject({ text: 'A' });
  });

  it('clears shift after ONE character — shift is one-shot', () => {
    const first = applyKey({ kind: 'char', value: 'a' }, '', true);
    expect(first.shifted).toBe(false);
    const second = applyKey({ kind: 'char', value: 'b' }, first.text, first.shifted);
    expect(second.text).toBe('Ab');
  });

  it('appends digits unchanged when shifted — there is no symbol layer', () => {
    expect(applyKey({ kind: 'char', value: '4' }, '', true)).toMatchObject({ text: '4' });
  });
});

describe('applyKey — space and backspace', () => {
  it('appends a space and clears shift', () => {
    expect(applyKey({ kind: 'space' }, 'ragamala', true)).toMatchObject({
      text: 'ragamala ',
      shifted: false,
    });
  });

  it('removes the last character', () => {
    expect(applyKey({ kind: 'backspace' }, 'raga', false)).toMatchObject({ text: 'rag' });
  });

  it('is a no-op on empty text rather than throwing', () => {
    expect(applyKey({ kind: 'backspace' }, '', false)).toMatchObject({ text: '' });
  });

  it('removes a trailing space too', () => {
    expect(applyKey({ kind: 'backspace' }, 'raga ', false)).toMatchObject({ text: 'raga' });
  });

  it('leaves shift alone', () => {
    expect(applyKey({ kind: 'backspace' }, 'ab', true).shifted).toBe(true);
  });
});

describe('applyKey — modifiers and actions', () => {
  it('toggles shift both ways', () => {
    expect(applyKey({ kind: 'shift' }, '', false).shifted).toBe(true);
    expect(applyKey({ kind: 'shift' }, '', true).shifted).toBe(false);
  });

  it('never alters the text for shift, submit or close', () => {
    for (const action of [{ kind: 'shift' }, { kind: 'submit' }, { kind: 'close' }] as const) {
      expect(applyKey(action, 'ragamala', false).text).toBe('ragamala');
    }
  });

  it('flags submit and close separately', () => {
    expect(applyKey({ kind: 'submit' }, 'x', false)).toMatchObject({ submit: true, close: false });
    expect(applyKey({ kind: 'close' }, 'x', false)).toMatchObject({ submit: false, close: true });
  });

  it('flags neither for ordinary typing', () => {
    const result = applyKey({ kind: 'char', value: 'a' }, '', false);
    expect(result.submit).toBe(false);
    expect(result.close).toBe(false);
  });
});

describe('keyFace', () => {
  it('uppercases letters on the shifted layer', () => {
    expect(keyFace({ label: 'q', action: { kind: 'char', value: 'q' } }, false)).toBe('q');
    expect(keyFace({ label: 'q', action: { kind: 'char', value: 'q' } }, true)).toBe('Q');
  });

  it('leaves non-character keys alone when shifted', () => {
    expect(keyFace({ label: '⌫', action: { kind: 'backspace' } }, true)).toBe('⌫');
    expect(keyFace({ label: 'space', action: { kind: 'space' } }, true)).toBe('space');
  });

  it('honours an explicit shift face', () => {
    expect(
      keyFace({ label: 'a', shiftLabel: 'Ä', action: { kind: 'char', value: 'a' } }, true),
    ).toBe('Ä');
  });
});

describe('layout shape', () => {
  it('has five rows', () => {
    expect(KEY_ROWS).toHaveLength(5);
  });

  it('covers the full alphabet and all ten digits exactly once', () => {
    const chars = KEY_ROWS.flat()
      .filter((key) => key.action.kind === 'char')
      .map((key) => key.label);

    const letters = chars.filter((c) => /[a-z]/.test(c));
    const digits = chars.filter((c) => /[0-9]/.test(c));

    expect(new Set(letters).size).toBe(26);
    expect(letters).toHaveLength(26);
    expect(digits.sort()).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });

  it('provides exactly one of each control key', () => {
    const kinds = KEY_ROWS.flat().map((key) => key.action.kind);
    for (const kind of ['shift', 'backspace', 'space', 'submit', 'close']) {
      expect(kinds.filter((k) => k === kind)).toHaveLength(1);
    }
  });

  it('fits inside the portrait canvas width', () => {
    // 2160 reference px. A keyboard wider than the canvas would be clipped.
    expect(keyboardWidth()).toBeLessThan(2160);
    expect(keyboardWidth()).toBeGreaterThan(1000);
  });

  it('reports a sane height', () => {
    const expected =
      KEY_ROWS.length * KEYBOARD_METRICS.keyHeight +
      (KEY_ROWS.length - 1) * KEYBOARD_METRICS.gap +
      KEYBOARD_METRICS.padding * 2;
    expect(keyboardHeight()).toBe(expected);
    // Must leave room for the field it serves on a 3840-tall canvas.
    expect(keyboardHeight()).toBeLessThan(1400);
  });
});

describe('isTap — the 15 px dismiss rule (HandleKeyboardDismiss, ui-spec §5)', () => {
  it('uses a 15 px threshold', () => {
    expect(TAP_SLOP_PX).toBe(15);
  });

  it('counts no movement as a tap', () => {
    expect(isTap(100, 100, 100, 100)).toBe(true);
  });

  it('counts small movement as a tap', () => {
    expect(isTap(100, 100, 110, 100)).toBe(true);
    expect(isTap(100, 100, 100, 114)).toBe(true);
  });

  it('counts a drag as NOT a tap, so scrolling the grid does not close the keyboard', () => {
    expect(isTap(100, 100, 100, 200)).toBe(false);
    expect(isTap(100, 100, 140, 100)).toBe(false);
  });

  it('measures diagonally, not per-axis', () => {
    // 11 px on each axis is under the threshold per-axis but 15.6 px diagonally.
    expect(isTap(0, 0, 11, 11)).toBe(false);
    expect(isTap(0, 0, 10, 10)).toBe(true);
  });

  it('is direction-agnostic', () => {
    expect(isTap(100, 100, 60, 100)).toBe(false);
    expect(isTap(100, 100, 95, 95)).toBe(true);
  });
});

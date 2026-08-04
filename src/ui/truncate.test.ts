import { describe, expect, it } from 'vitest';
import { ELLIPSIS, truncateToWidth } from './truncate';

/** 10 px per character, so widths are trivially predictable. */
const perChar = (text: string) => text.length * 10;

describe('ELLIPSIS', () => {
  /**
   * The whole point of this module: `text-overflow: ellipsis` asks the FONT for
   * U+2026, and Conduit ITC's glyph is wrong. Three full stops are a glyph it has.
   */
  it('is three literal full stops, never U+2026', () => {
    expect(ELLIPSIS).toBe('...');
    expect(ELLIPSIS).not.toContain('…');
    expect(ELLIPSIS.length).toBe(3);
  });
});

describe('truncateToWidth', () => {
  it('leaves text that already fits completely untouched', () => {
    expect(truncateToWidth('Photography', perChar, 500)).toBe('Photography');
  });

  it('leaves text that fits EXACTLY untouched', () => {
    // 11 chars = 110 px, budget 110 px.
    expect(truncateToWidth('Photography', perChar, 110)).toBe('Photography');
  });

  it('appends the dots once it has to cut', () => {
    // Budget 100 px, dots cost 30 px, so 7 characters fit.
    expect(truncateToWidth('Photography', perChar, 100)).toBe('Photogr...');
  });

  it('never exceeds the budget', () => {
    const long = 'Ram with Sita, Lakshman and Hanuman (Ram Darbar)';
    for (const available of [40, 70, 100, 155, 300, 460]) {
      const out = truncateToWidth(long, perChar, available);
      expect(perChar(out)).toBeLessThanOrEqual(available);
    }
  });

  it('returns the dots alone when not even one character fits', () => {
    // 30 px of dots leaves nothing over.
    expect(truncateToWidth('Photography', perChar, 30)).toBe(ELLIPSIS);
    expect(truncateToWidth('Photography', perChar, 35)).toBe(ELLIPSIS);
  });

  it('returns the dots alone when the budget cannot even hold them', () => {
    expect(truncateToWidth('Photography', perChar, 10)).toBe(ELLIPSIS);
  });

  it('handles empty text', () => {
    expect(truncateToWidth('', perChar, 100)).toBe('');
  });

  /**
   * A container that has not been laid out yet reports 0. Truncating against that
   * would blank the title for a frame, so the full text is kept until a real width
   * arrives (the ResizeObserver re-fits then).
   */
  it('leaves the text alone when the container has no width yet', () => {
    expect(truncateToWidth('Photography', perChar, 0)).toBe('Photography');
    expect(truncateToWidth('Photography', perChar, -5)).toBe('Photography');
  });

  it('trims a trailing comma or space before the dots', () => {
    // 9 chars fit in 120 px: "Ram with " -> trimmed to "Ram with".
    expect(truncateToWidth('Ram with Sita', perChar, 120)).toBe('Ram with...');
    // Cut right after the comma.
    expect(truncateToWidth('Sita, Lakshman', perChar, 80)).toBe('Sita...');
  });

  it('accepts a custom tail, and budgets for ITS width not the default', () => {
    // A 1-char tail costs 10 px, leaving 90 px -> 9 characters, where the 3-char
    // default leaves 70 px -> 7. The tail's own width is what sets the budget.
    expect(truncateToWidth('Photography', perChar, 100, '…')).toBe('Photograp…');
    expect(truncateToWidth('Photography', perChar, 100)).toBe('Photogr...');
  });

  it('is stable — truncating an already-truncated string is a no-op', () => {
    const once = truncateToWidth('Ram with Sita, Lakshman', perChar, 150);
    expect(truncateToWidth(once, perChar, 150)).toBe(once);
  });

  /** Proportional fonts: wide glyphs must be respected, not assumed uniform. */
  it('respects a proportional measurer', () => {
    const proportional = (text: string) =>
      [...text].reduce((total, ch) => total + (ch === 'i' || ch === 'l' ? 4 : 12), 0);
    const out = truncateToWidth('illustration', proportional, 60);
    expect(proportional(out)).toBeLessThanOrEqual(60);
    expect(out.endsWith('...')).toBe(true);
  });
});

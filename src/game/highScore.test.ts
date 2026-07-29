import { describe, expect, it } from 'vitest';
import {
  NO_HIGH_SCORE,
  PRODUCT_NAME,
  formatHighScore,
  highScoreKey,
  readHighScore,
  resolveIdentifier,
  writeHighScoreIfFaster,
} from './index';
import { memoryStore } from './testing';

describe('resolveIdentifier', () => {
  it('prefers the artwork title', () => {
    expect(resolveIdentifier({ artworkTitle: 'Ragamala', textureName: 'image_00' })).toBe(
      'Ragamala',
    );
  });

  it('falls back to the texture name, then to "Default"', () => {
    expect(resolveIdentifier({ textureName: 'image_00' })).toBe('image_00');
    expect(resolveIdentifier({})).toBe('Default');
    expect(resolveIdentifier()).toBe('Default');
  });

  it('treats whitespace-only titles as absent — a QR upload has no title', () => {
    expect(resolveIdentifier({ artworkTitle: '   ', textureName: 'image_00' })).toBe('image_00');
    expect(resolveIdentifier({ artworkTitle: '' })).toBe('Default');
  });
});

describe('highScoreKey', () => {
  it('matches the Unity PlayerPrefs key shape exactly', () => {
    expect(highScoreKey({ artworkTitle: 'Ragamala' })).toBe(
      'MAP Jigsaw Puzzle_HighScoreKey_Ragamala',
    );
    expect(PRODUCT_NAME).toBe('MAP Jigsaw Puzzle');
  });

  it('is per artwork, not global', () => {
    expect(highScoreKey({ artworkTitle: 'A' })).not.toBe(highScoreKey({ artworkTitle: 'B' }));
  });

  it('uses Default when there is no identity', () => {
    expect(highScoreKey()).toBe('MAP Jigsaw Puzzle_HighScoreKey_Default');
  });
});

describe('readHighScore', () => {
  it('returns -1 when unset', () => {
    expect(readHighScore(memoryStore(), { artworkTitle: 'A' })).toBe(NO_HIGH_SCORE);
  });

  it('reads a stored value', () => {
    const store = memoryStore({ 'MAP Jigsaw Puzzle_HighScoreKey_A': '42.5' });
    expect(readHighScore(store, { artworkTitle: 'A' })).toBeCloseTo(42.5, 10);
  });

  it('treats a corrupt or negative value as no record instead of throwing', () => {
    expect(readHighScore(memoryStore({ 'MAP Jigsaw Puzzle_HighScoreKey_A': 'oops' }), {
      artworkTitle: 'A',
    })).toBe(NO_HIGH_SCORE);
    expect(readHighScore(memoryStore({ 'MAP Jigsaw Puzzle_HighScoreKey_A': '-5' }), {
      artworkTitle: 'A',
    })).toBe(NO_HIGH_SCORE);
  });
});

describe('writeHighScoreIfFaster', () => {
  it('writes the first record', () => {
    const store = memoryStore();
    const result = writeHighScoreIfFaster(store, 30, { artworkTitle: 'A' });
    expect(result.written).toBe(true);
    expect(result.previousBest).toBe(NO_HIGH_SCORE);
    expect(result.best).toBe(30);
    expect(readHighScore(store, { artworkTitle: 'A' })).toBe(30);
  });

  it('writes a strictly faster time', () => {
    const store = memoryStore({ 'MAP Jigsaw Puzzle_HighScoreKey_A': '30' });
    expect(writeHighScoreIfFaster(store, 29.9, { artworkTitle: 'A' }).written).toBe(true);
    expect(readHighScore(store, { artworkTitle: 'A' })).toBeCloseTo(29.9, 10);
  });

  it('does NOT write an equal time', () => {
    const store = memoryStore({ 'MAP Jigsaw Puzzle_HighScoreKey_A': '30' });
    const result = writeHighScoreIfFaster(store, 30, { artworkTitle: 'A' });
    expect(result.written).toBe(false);
    expect(result.best).toBe(30);
  });

  it('does NOT write a slower time', () => {
    const store = memoryStore({ 'MAP Jigsaw Puzzle_HighScoreKey_A': '30' });
    expect(writeHighScoreIfFaster(store, 31, { artworkTitle: 'A' }).written).toBe(false);
    expect(readHighScore(store, { artworkTitle: 'A' })).toBe(30);
  });

  it('rejects a non-finite or negative elapsed time', () => {
    const store = memoryStore();
    expect(writeHighScoreIfFaster(store, Number.NaN, { artworkTitle: 'A' }).written).toBe(false);
    expect(writeHighScoreIfFaster(store, -3, { artworkTitle: 'A' }).written).toBe(false);
    expect(store.entries.size).toBe(0);
  });

  it('keeps records for different artworks independent', () => {
    const store = memoryStore();
    writeHighScoreIfFaster(store, 20, { artworkTitle: 'A' });
    writeHighScoreIfFaster(store, 50, { artworkTitle: 'B' });
    expect(readHighScore(store, { artworkTitle: 'A' })).toBe(20);
    expect(readHighScore(store, { artworkTitle: 'B' })).toBe(50);
  });
});

describe('formatHighScore', () => {
  it('renders --:-- when there is no record', () => {
    expect(formatHighScore(NO_HIGH_SCORE)).toBe('--:--');
  });

  it('renders mm:ss otherwise', () => {
    expect(formatHighScore(95)).toBe('01:35');
  });
});

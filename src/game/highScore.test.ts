import { describe, expect, it } from 'vitest';
import {
  NO_HIGH_SCORE,
  PRODUCT_NAME,
  formatHighScore,
  highScoreKey,
  readHighScore,
  writeHighScoreIfFaster,
} from './index';
import { memoryStore } from './testing';

const KEY = 'MAP Jigsaw Puzzle_HighScoreKey';

describe('highScoreKey', () => {
  it('is a single global key with no artwork segment', () => {
    expect(highScoreKey()).toBe(KEY);
    expect(PRODUCT_NAME).toBe('MAP Jigsaw Puzzle');
  });

  it('takes the product name so the key can be namespaced per build', () => {
    expect(highScoreKey('Other Product')).toBe('Other Product_HighScoreKey');
  });
});

describe('readHighScore', () => {
  it('returns -1 when unset', () => {
    expect(readHighScore(memoryStore())).toBe(NO_HIGH_SCORE);
  });

  it('reads a stored value', () => {
    expect(readHighScore(memoryStore({ [KEY]: '42.5' }))).toBeCloseTo(42.5, 10);
  });

  it('treats a corrupt or negative value as no record instead of throwing', () => {
    expect(readHighScore(memoryStore({ [KEY]: 'oops' }))).toBe(NO_HIGH_SCORE);
    expect(readHighScore(memoryStore({ [KEY]: '-5' }))).toBe(NO_HIGH_SCORE);
  });

  it('ignores a legacy per-artwork record — those keys are unreachable now', () => {
    const store = memoryStore({ 'MAP Jigsaw Puzzle_HighScoreKey_Ragamala': '12' });
    expect(readHighScore(store)).toBe(NO_HIGH_SCORE);
  });
});

describe('writeHighScoreIfFaster', () => {
  it('writes the first record', () => {
    const store = memoryStore();
    const result = writeHighScoreIfFaster(store, 30);
    expect(result.written).toBe(true);
    expect(result.previousBest).toBe(NO_HIGH_SCORE);
    expect(result.best).toBe(30);
    expect(readHighScore(store)).toBe(30);
  });

  it('writes a strictly faster time', () => {
    const store = memoryStore({ [KEY]: '30' });
    expect(writeHighScoreIfFaster(store, 29.9).written).toBe(true);
    expect(readHighScore(store)).toBeCloseTo(29.9, 10);
  });

  it('does NOT write an equal time', () => {
    const store = memoryStore({ [KEY]: '30' });
    const result = writeHighScoreIfFaster(store, 30);
    expect(result.written).toBe(false);
    expect(result.best).toBe(30);
  });

  it('does NOT write a slower time', () => {
    const store = memoryStore({ [KEY]: '30' });
    expect(writeHighScoreIfFaster(store, 31).written).toBe(false);
    expect(readHighScore(store)).toBe(30);
  });

  it('rejects a non-finite or negative elapsed time', () => {
    const store = memoryStore();
    expect(writeHighScoreIfFaster(store, Number.NaN).written).toBe(false);
    expect(writeHighScoreIfFaster(store, -3).written).toBe(false);
    expect(store.entries.size).toBe(0);
  });

  /**
   * The behaviour this change is FOR: the record carries across artworks, so a
   * faster run on a different picture beats the standing best (ADR-041). Under
   * the old per-artwork key these two runs landed in separate buckets.
   */
  it('keeps ONE record across different artworks', () => {
    const store = memoryStore();
    writeHighScoreIfFaster(store, 50);
    writeHighScoreIfFaster(store, 20);
    expect(readHighScore(store)).toBe(20);
    expect(store.entries.size).toBe(1);
  });

  it('does not let a slower run on a later artwork overwrite the best', () => {
    const store = memoryStore();
    writeHighScoreIfFaster(store, 20);
    writeHighScoreIfFaster(store, 50);
    expect(readHighScore(store)).toBe(20);
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

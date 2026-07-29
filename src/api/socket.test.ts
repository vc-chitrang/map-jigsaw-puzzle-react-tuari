import { describe, expect, it } from 'vitest';
import { extractImageUrl } from './socket';

/**
 * The `new-upload` payload shape is not documented — the Unity handler only says
 * "payload contains an image URL" — so the extractor accepts the plausible
 * spellings rather than guessing one and failing silently on the kiosk.
 */
describe('extractImageUrl', () => {
  const url = 'https://i-am-puzzle.map-india.org/uploads/abc.jpg';

  it('accepts a bare string', () => {
    expect(extractImageUrl(url)).toBe(url);
  });

  it('trims whitespace', () => {
    expect(extractImageUrl(`  ${url}  `)).toBe(url);
  });

  it('accepts each of the common key spellings', () => {
    expect(extractImageUrl({ url })).toBe(url);
    expect(extractImageUrl({ imageUrl: url })).toBe(url);
    expect(extractImageUrl({ image_url: url })).toBe(url);
    expect(extractImageUrl({ image: url })).toBe(url);
    expect(extractImageUrl({ path: url })).toBe(url);
  });

  it('prefers `url` when several keys are present', () => {
    expect(extractImageUrl({ path: 'other', url })).toBe(url);
  });

  it('looks inside a wrapper object', () => {
    expect(extractImageUrl({ data: { url } })).toBe(url);
    expect(extractImageUrl({ payload: { imageUrl: url } })).toBe(url);
    expect(extractImageUrl({ result: { image: url } })).toBe(url);
  });

  it('handles more than one level of wrapping', () => {
    expect(extractImageUrl({ data: { data: { url } } })).toBe(url);
    expect(extractImageUrl({ payload: { result: { imageUrl: url } } })).toBe(url);
  });

  it('takes the first usable entry of an array', () => {
    expect(extractImageUrl([{ nothing: 1 }, { url }])).toBe(url);
    expect(extractImageUrl(['', url])).toBe(url);
  });

  it('returns null when there is no URL to find', () => {
    expect(extractImageUrl(null)).toBeNull();
    expect(extractImageUrl(undefined)).toBeNull();
    expect(extractImageUrl('')).toBeNull();
    expect(extractImageUrl('   ')).toBeNull();
    expect(extractImageUrl({})).toBeNull();
    expect(extractImageUrl({ url: '' })).toBeNull();
    expect(extractImageUrl({ url: 42 })).toBeNull();
    expect(extractImageUrl([])).toBeNull();
    expect(extractImageUrl(123)).toBeNull();
  });

  it('gives up past the depth bound instead of recursing without limit', () => {
    // MAX_DEPTH is 4. Six wrappers is beyond it, so the URL is not found — the
    // point being that the recursion is bounded by design, not by luck.
    const deep = { data: { data: { data: { data: { data: { data: { url } } } } } } };
    expect(extractImageUrl(deep)).toBeNull();
  });
});

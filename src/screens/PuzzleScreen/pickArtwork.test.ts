import { describe, expect, it } from 'vitest';
import type { ResultsData } from '../../api/types';
import { pickArtwork } from './pickArtwork';

/**
 * Only the fields `pickArtwork` reads. Cast rather than filled out: inventing 20
 * unused strings per fixture would hide which three actually drive the rules.
 */
function item(id: number, options: { title?: string; image?: string } = {}): ResultsData {
  return {
    id,
    title: options.title ?? `Artwork ${id}`,
    primary_image: options.image ?? `https://example.test/${id}.jpg`,
  } as ResultsData;
}

/** Always picks the first candidate, so selection is deterministic. */
const first = () => 0;
/** Always picks the last candidate — also exercises the rng-returns-1 guard. */
const last = () => 1;

describe('pickArtwork — playability', () => {
  it('returns null when nothing has an image', () => {
    expect(pickArtwork([item(1, { image: '' }), item(2, { image: '   ' })], first)).toBeNull();
  });

  it('returns null for an empty page', () => {
    expect(pickArtwork([], first)).toBeNull();
  });

  it('never returns a record without an image', () => {
    const chosen = pickArtwork([item(1, { image: '' }), item(2)], first);
    expect(chosen?.id).toBe(2);
  });
});

describe('pickArtwork — title preference', () => {
  it('prefers a titled record over an untitled one', () => {
    // Untitled first, so a picker that ignored titles would return id 1.
    const chosen = pickArtwork([item(1, { title: '' }), item(2, { title: 'Ram Darbar' })], first);
    expect(chosen?.id).toBe(2);
  });

  it('treats a whitespace-only title as untitled', () => {
    const chosen = pickArtwork([item(1, { title: '   ' }), item(2, { title: 'Universe' })], first);
    expect(chosen?.id).toBe(2);
  });

  it('falls back to an untitled record rather than returning nothing', () => {
    const chosen = pickArtwork([item(1, { title: '' }), item(2, { title: '' })], first);
    expect(chosen?.id).toBe(1);
  });
});

describe('pickArtwork — recency is the Play Again guarantee', () => {
  it('never returns a recently played id', () => {
    // rng picks index 0, so without the recency rule this is id 1.
    const chosen = pickArtwork([item(1), item(2)], first, [1]);
    expect(chosen?.id).toBe(2);
  });

  it('holds for EVERY rng value, not just on average', () => {
    const page = [item(1), item(2), item(3), item(4)];
    const recent = [2, 3];

    for (let step = 0; step <= 20; step++) {
      const chosen = pickArtwork(page, () => step / 20, recent);
      expect(recent).not.toContain(chosen!.id);
    }
  });

  /**
   * The scenario the client reported, reduced to two records: win, then Play
   * Again. Whatever the rng does, the second pick cannot be the first.
   */
  it('cannot hand back the artwork just played', () => {
    const page = [item(1), item(2)];
    const played = pickArtwork(page, first)!;
    const next = pickArtwork(page, first, [played.id])!;
    expect(next.id).not.toBe(played.id);
  });

  /**
   * THE REGRESSION THIS FILE EXISTS FOR.
   *
   * Once the recent window covers the whole pool, something has to give. It must
   * be the OLDEST entry, never the newest. A first attempt used one flat set and
   * dropped it wholesale, which made the artwork just played eligible again — and
   * a live 2-record run showed consecutive repeats, exactly as reported.
   */
  it('gives up the OLDEST recent id first, never the most recent', () => {
    const page = [item(1), item(2)];

    // Both records are "recent", 2 most recently. The only sane answer is 1.
    for (let step = 0; step <= 20; step++) {
      const chosen = pickArtwork(page, () => step / 20, [2, 1]);
      expect(chosen?.id).toBe(1);
    }
  });

  it('alternates forever on a two-record pool', () => {
    const page = [item(1), item(2)];
    const recent: number[] = [];
    const sequence: number[] = [];

    for (let round = 0; round < 8; round++) {
      const chosen = pickArtwork(page, () => round / 8, recent)!;
      sequence.push(chosen.id);
      recent.unshift(chosen.id);
    }

    // No two neighbours the same — the property the client asked for.
    const repeats = sequence.slice(1).filter((id, i) => id === sequence[i]);
    expect(repeats).toEqual([]);
  });

  it('still returns something when only one record exists', () => {
    // Nothing else to serve, so a repeat beats a blank board.
    const chosen = pickArtwork([item(1)], first, [1]);
    expect(chosen?.id).toBe(1);
  });

  it('ignores ids that are not on the page', () => {
    const chosen = pickArtwork([item(7)], first, [99]);
    expect(chosen?.id).toBe(7);
  });
});

describe('pickArtwork — rng bounds', () => {
  it('an rng returning exactly 1 stays in range', () => {
    const chosen = pickArtwork([item(1), item(2), item(3)], last);
    expect(chosen?.id).toBe(3);
  });

  it('spans the whole pool across the rng range', () => {
    const page = [item(1), item(2), item(3), item(4)];
    const ids = new Set<number>();
    for (let step = 0; step < 40; step++) {
      ids.add(pickArtwork(page, () => step / 40)!.id);
    }
    expect(ids).toEqual(new Set([1, 2, 3, 4]));
  });
});

import { describe, expect, it } from 'vitest';
import { FEATURED_HOME_ARTWORK } from './loadArtwork';

/**
 * The home screen is pinned to one record. A wrong id or accession does not error —
 * it quietly shows a different artwork, or falls through to a random one — so the
 * values are pinned here against the live API response captured on 2026-08-04 via
 * `npm run check:api -- -Query MAC.00468`, which returned exactly one record.
 *
 * Source of truth for the request:
 *   https://map-india.org/collections/cumulus/modern-contemporary-art/MAC.00468/?id=2824
 */
describe('FEATURED_HOME_ARTWORK', () => {
  it('matches the id in the client-supplied URL', () => {
    expect(FEATURED_HOME_ARTWORK.id).toBe(2824);
  });

  it('matches the accession in the client-supplied URL', () => {
    expect(FEATURED_HOME_ARTWORK.accession).toBe('MAC.00468');
  });

  it('records the title the API returns for that record', () => {
    expect(FEATURED_HOME_ARTWORK.title).toBe('Universe');
  });

  /**
   * The lookup searches `q=<accession>`, so a blank or whitespace accession would
   * query the whole collection and pin the home screen to an arbitrary record.
   */
  it('has a non-empty accession, since it is used as the search term', () => {
    expect(FEATURED_HOME_ARTWORK.accession.trim()).toBe(FEATURED_HOME_ARTWORK.accession);
    expect(FEATURED_HOME_ARTWORK.accession.length).toBeGreaterThan(0);
  });

  it('has a positive integer id', () => {
    expect(Number.isInteger(FEATURED_HOME_ARTWORK.id)).toBe(true);
    expect(FEATURED_HOME_ARTWORK.id).toBeGreaterThan(0);
  });
});

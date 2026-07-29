import { describe, expect, it } from 'vitest';
import { cardImageUrl, thumbnailUrl } from './imagekit';
import { NO_FILTERS, SORT_MODES, formatResultCount, hasImage, primaryArtistName } from './types';
import type { Pagination, ResultsData } from './types';

const pagination = (over: Partial<Pagination> = {}): Pagination => ({
  total: 120,
  count: 40,
  per_page: 40,
  current_page: 1,
  last_page: 3,
  from: 1,
  to: 40,
  ...over,
});

const artwork = (over: Partial<ResultsData> = {}): ResultsData =>
  ({
    id: 1,
    title: 'Ragamala',
    date: '1800',
    period: '',
    accession_number: 'MAP/1',
    medium: '',
    dimensions: '',
    status: '',
    public_access: 1,
    primary_image: 'https://map-india.org/media/artwork/ragamala-01.tif',
    instance_id: 1,
    department_id: 1,
    department: 'Painting',
    signed: '',
    keywords: '',
    inscribed: '',
    paper_support: '',
    condition: null,
    attributes: null,
    artists: [],
    ...over,
  }) as ResultsData;

describe('thumbnailUrl — ported from CardItemUI.BuildPlaceholderUrl', () => {
  it('builds the ImageKit 600 px render from the file basename', () => {
    expect(thumbnailUrl('https://map-india.org/media/artwork/ragamala-01.tif')).toBe(
      'https://ik.imagekit.io/map/tr:n-image_w600/map/artwork/ragamala-01.jpg',
    );
  });

  it('drops any query string or fragment before taking the basename', () => {
    expect(thumbnailUrl('https://x.test/a/b/pot.png?v=2#frag')).toBe(
      'https://ik.imagekit.io/map/tr:n-image_w600/map/artwork/pot.jpg',
    );
  });

  it('normalises backslashes, as the Unity implementation does', () => {
    expect(thumbnailUrl('https://x.test/a\\b\\statue.jpg')).toBe(
      'https://ik.imagekit.io/map/tr:n-image_w600/map/artwork/statue.jpg',
    );
  });

  it('handles a name with no extension', () => {
    expect(thumbnailUrl('https://x.test/a/noext')).toBe(
      'https://ik.imagekit.io/map/tr:n-image_w600/map/artwork/noext.jpg',
    );
  });

  it('URL-encodes a basename containing a space', () => {
    expect(thumbnailUrl('https://x.test/a/two words.jpg')).toBe(
      'https://ik.imagekit.io/map/tr:n-image_w600/map/artwork/two%20words.jpg',
    );
  });

  it('returns null when no basename can be derived', () => {
    expect(thumbnailUrl('')).toBeNull();
    expect(thumbnailUrl('https://x.test/')).toBeNull();
  });
});

describe('cardImageUrl', () => {
  it('prefers the thumbnail', () => {
    expect(cardImageUrl('https://map-india.org/a/b.tif')).toContain('ik.imagekit.io');
  });

  it('falls back to the master image when no thumbnail can be built', () => {
    // A bare origin yields no basename, so the original must be returned rather
    // than a broken ImageKit URL.
    expect(cardImageUrl('https://map-india.org/')).toBe('https://map-india.org/');
  });
});

describe('SORT_MODES — matches CollectionUIManager', () => {
  it('has five modes with index 0 unsorted', () => {
    expect(SORT_MODES).toHaveLength(5);
    expect(SORT_MODES[0]).toEqual({ label: 'Default', field: '', order: '' });
  });

  it('maps fields and orders exactly as the Unity arrays do', () => {
    // SortFields = { "", "artist", "artist", "date", "date" }
    // SortOrders = { "", "ASC",    "DESC",   "ASC",  "DESC" }
    expect(SORT_MODES.map((m) => m.field)).toEqual(['', 'artist', 'artist', 'date', 'date']);
    expect(SORT_MODES.map((m) => m.order)).toEqual(['', 'ASC', 'DESC', 'ASC', 'DESC']);
  });

  it('uses UPPERCASE orders — the API is given ASC/DESC, not asc/desc', () => {
    expect(SORT_MODES[1]?.order).toBe('ASC');
    expect(SORT_MODES[2]?.order).toBe('DESC');
  });
});

describe('formatResultCount', () => {
  it('matches the Unity string exactly', () => {
    expect(formatResultCount(pagination())).toBe('1 to 40 of total 120 results');
  });

  it('reports no results for an empty page and for null', () => {
    expect(formatResultCount(pagination({ total: 0 }))).toBe('No results found');
    expect(formatResultCount(null)).toBe('No results found');
  });
});

describe('hasImage', () => {
  it('requires a non-blank primary_image', () => {
    expect(hasImage(artwork())).toBe(true);
    expect(hasImage(artwork({ primary_image: '' }))).toBe(false);
    expect(hasImage(artwork({ primary_image: '   ' }))).toBe(false);
  });
});

describe('primaryArtistName', () => {
  it('returns the first artist, or an empty string', () => {
    expect(
      primaryArtistName(
        artwork({ artists: [{ id: 1, name: 'Anon', bio: '', role: '', display_order: 1 }] }),
      ),
    ).toBe('Anon');
    expect(primaryArtistName(artwork({ artists: [] }))).toBe('');
  });
});

describe('NO_FILTERS', () => {
  it('uses 0 for id filters and empty strings for value filters', () => {
    // Unity tests ids with `> 0` and strings with IsNullOrEmpty, so these are the
    // values that mean "send no parameter".
    expect(NO_FILTERS).toEqual({
      department: 0,
      classification: 0,
      artist: 0,
      culture: '',
      date: '',
    });
  });
});

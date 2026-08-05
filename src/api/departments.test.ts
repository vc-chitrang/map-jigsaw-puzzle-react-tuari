import { describe, expect, it } from 'vitest';
import { COLLECTION_DEPARTMENTS } from './departments';

/**
 * These ids are sent straight to the API as `department`. A wrong one does not
 * error — it returns a grid filtered to something else, or nothing at all — so the
 * values are pinned here against the live response captured on 2026-08-04 via
 * `npm run check:api` (which prints `id -> dept`).
 *
 * If MAP renumbers a department these tests will still pass while the app quietly
 * filters wrongly, so re-run the probe when the collection changes shape.
 */
const LIVE_API_DEPARTMENTS = [
  { id: 28, dept: 'Living Traditions' },
  { id: 5, dept: 'Modern & Contemporary Art' },
  { id: 4, dept: 'Photography' },
  { id: 6, dept: 'Popular Culture' },
  { id: 29, dept: 'Pre-Modern Art' },
  { id: 13, dept: 'Textiles, Craft & Design' },
] as const;

describe('COLLECTION_DEPARTMENTS', () => {
  it('has exactly the six departments the API offers', () => {
    expect(COLLECTION_DEPARTMENTS).toHaveLength(6);
  });

  it('matches the live API ids and labels, in the reference display order', () => {
    expect(COLLECTION_DEPARTMENTS.map(({ id, dept }) => ({ id, dept }))).toEqual(
      LIVE_API_DEPARTMENTS.map(({ id, dept }) => ({ id, dept })),
    );
  });

  it('uses ids that are NOT sequential, so none may be derived from position', () => {
    const ids = COLLECTION_DEPARTMENTS.map((d) => d.id);
    expect(ids).toEqual([28, 5, 4, 6, 29, 13]);
    // Guards against anyone "tidying" these into 1..6.
    expect(ids).not.toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('has unique ids', () => {
    const ids = COLLECTION_DEPARTMENTS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every department its own tile image', () => {
    const tiles = COLLECTION_DEPARTMENTS.map((d) => d.tile);
    expect(new Set(tiles).size).toBe(tiles.length);
    for (const tile of tiles) {
      expect(tile).toMatch(/^\/assets\/collection\/[a-z0-9-]+\.jpg$/);
    }
  });

  /**
   * The button label may wrap, but it must still name the same department as the
   * `dept` sent to the API — otherwise a visitor taps "Photography" and gets
   * something else.
   */
  it('keeps each label in step with its API dept name', () => {
    for (const { label, dept } of COLLECTION_DEPARTMENTS) {
      expect(label.replace(/\n/g, ' ')).toBe(dept);
    }
  });
});

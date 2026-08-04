import { describe, expect, it } from 'vitest';
import { NO_FILTERS, type FilterSelection } from '../../api/types';
import { isUnfilteredQuery } from './useCollection';

/**
 * `isUnfilteredQuery` decides whether a response's `filters` block may be used to
 * populate the five dropdowns.
 *
 * It matters because the API NARROWS `filters` to match the query. Taking the lists
 * from a filtered response is what made the Department dropdown offer a single
 * option after arriving from "Select The Collection" (ADR-050) — the query already
 * carried a department, so the reply described only that department.
 */
const withSelection = (partial: Partial<FilterSelection>): FilterSelection => ({
  ...NO_FILTERS,
  ...partial,
});

describe('isUnfilteredQuery', () => {
  it('is true for a query with no filters and no search', () => {
    expect(isUnfilteredQuery(NO_FILTERS, '')).toBe(true);
  });

  it('is false once a department is applied — the case that caused the bug', () => {
    expect(isUnfilteredQuery(withSelection({ department: 4 }), '')).toBe(false);
  });

  it('is false for every individual filter', () => {
    expect(isUnfilteredQuery(withSelection({ department: 28 }), '')).toBe(false);
    expect(isUnfilteredQuery(withSelection({ classification: 3 }), '')).toBe(false);
    expect(isUnfilteredQuery(withSelection({ artist: 12 }), '')).toBe(false);
    expect(isUnfilteredQuery(withSelection({ culture: 'Indian' }), '')).toBe(false);
    expect(isUnfilteredQuery(withSelection({ date: '1900' }), '')).toBe(false);
  });

  it('is false when a search has been committed', () => {
    expect(isUnfilteredQuery(NO_FILTERS, 'ram')).toBe(false);
  });

  /**
   * Ids are only "applied" when positive — 0 is the API's "no filter" sentinel, so a
   * zero must not be mistaken for a real selection.
   */
  it('treats id 0 as no filter', () => {
    expect(isUnfilteredQuery(withSelection({ department: 0, classification: 0, artist: 0 }), '')).toBe(
      true,
    );
  });

  it('treats an empty string as no filter for the value-based filters', () => {
    expect(isUnfilteredQuery(withSelection({ culture: '', date: '' }), '')).toBe(true);
  });
});

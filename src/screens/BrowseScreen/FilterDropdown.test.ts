import { describe, expect, it } from 'vitest';
import { filterOptions, type DropdownOption } from './FilterDropdown';

const artists: DropdownOption[] = [
  { value: 11, label: 'Raja Ravi Varma' },
  { value: 12, label: 'Amrita Sher-Gil' },
  { value: 13, label: 'Jamini Roy' },
  { value: 14, label: 'M. F. Husain' },
];

describe('filterOptions', () => {
  it('returns everything for an empty or whitespace search', () => {
    expect(filterOptions(artists, '')).toBe(artists);
    expect(filterOptions(artists, '   ')).toBe(artists);
  });

  it('matches a case-insensitive substring', () => {
    expect(filterOptions(artists, 'amrita').map((o) => o.label)).toEqual(['Amrita Sher-Gil']);
    expect(filterOptions(artists, 'AMRITA').map((o) => o.label)).toEqual(['Amrita Sher-Gil']);
    expect(filterOptions(artists, 'Sher').map((o) => o.label)).toEqual(['Amrita Sher-Gil']);
  });

  it('matches mid-word, not just prefixes', () => {
    // "avi" appears inside "Ravi" — a prefix-only match would miss it, and the
    // live artist list has 2,022 entries where that matters.
    expect(filterOptions(artists, 'avi').map((o) => o.label)).toEqual(['Raja Ravi Varma']);
  });

  it('returns several matches when several apply', () => {
    expect(filterOptions(artists, 'a').length).toBeGreaterThan(1);
  });

  it('ignores surrounding whitespace in the search', () => {
    expect(filterOptions(artists, '  jamini  ').map((o) => o.label)).toEqual(['Jamini Roy']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterOptions(artists, 'zzzz')).toEqual([]);
  });

  it('handles punctuation in labels', () => {
    expect(filterOptions(artists, 'm. f.').map((o) => o.label)).toEqual(['M. F. Husain']);
  });

  it('does not mutate the input', () => {
    const before = JSON.stringify(artists);
    filterOptions(artists, 'roy');
    expect(JSON.stringify(artists)).toBe(before);
  });

  it('works on string-valued options (culture and date filter by value, not id)', () => {
    const cultures: DropdownOption[] = [
      { value: 'Rajasthan', label: 'Rajasthan' },
      { value: 'Bengal', label: 'Bengal' },
    ];
    expect(filterOptions(cultures, 'beng')).toEqual([{ value: 'Bengal', label: 'Bengal' }]);
  });
});

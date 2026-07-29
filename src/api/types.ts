/**
 * MAP collection API types — transcribed from docs/game-logic.md §8.5, which was
 * derived from the Unity `SerializedClasses.cs`.
 *
 * Fields are typed as the API actually returns them. Nothing here is invented; if
 * a field is needed that is not listed, check the real response first rather than
 * adding a guess.
 */

export interface Artist {
  readonly id: number;
  readonly name: string;
  readonly bio: string;
  readonly role: string;
  readonly display_order: number;
}

export interface ResultsData {
  readonly id: number;
  readonly title: string;
  readonly date: string;
  readonly period: string;
  readonly accession_number: string;
  readonly medium: string;
  readonly dimensions: string;
  readonly status: string;
  readonly public_access: number;
  /** Absolute URL. Used for both the board artwork and the card thumbnail. */
  readonly primary_image: string;
  readonly instance_id: number;
  readonly department_id: number;
  readonly department: string;
  readonly signed: string;
  readonly keywords: string;
  readonly inscribed: string;
  readonly paper_support: string;
  readonly condition: unknown;
  readonly attributes: unknown;
  readonly artists: readonly Artist[];
}

export interface Pagination {
  readonly total: number;
  readonly count: number;
  readonly per_page: number;
  readonly current_page: number;
  readonly last_page: number;
  readonly to: number;
  readonly from: number;
}

export interface CollectionFilters {
  readonly classification: readonly { id: number; class: string; period: string }[];
  readonly department: readonly { id: number; dept: string; period: unknown }[];
  readonly artist: readonly Artist[];
  readonly culture: readonly { id: number; culture: string; period: string }[];
  readonly date: readonly { id: number; date: string; period: string }[];
}

export interface MAPData {
  readonly results: {
    readonly data: readonly ResultsData[];
    readonly pagination: Pagination;
  };
  readonly filters: CollectionFilters;
}

/** Query parameters. Sent to the Rust `collection_fetch` command, never to the API directly. */
export interface CollectionParams {
  /** `_itemsPerPage`, default 40. */
  readonly limit?: number;
  /** 1-based. */
  readonly page?: number;
  readonly q?: string;
  readonly department?: number;
  readonly classification?: number;
  readonly artist?: number;
  readonly culture?: string;
  readonly date?: string;
  readonly sortBy?: string;
  readonly sortOrder?: string;
}

/**
 * Sort dropdown, matching `CollectionUIManager`:
 *
 *   SortFields = { "", "artist", "artist", "date", "date" }
 *   SortOrders = { "", "ASC",    "DESC",   "ASC",  "DESC" }
 *
 * Index 0 is unsorted and sends neither parameter. Note the orders are UPPERCASE
 * in the Unity source.
 */
export const SORT_MODES = [
  { label: 'Default', field: '', order: '' },
  { label: 'Artist Name (A-Z)', field: 'artist', order: 'ASC' },
  { label: 'Artist Name (Z-A)', field: 'artist', order: 'DESC' },
  { label: 'Date Ascending', field: 'date', order: 'ASC' },
  { label: 'Date Descending', field: 'date', order: 'DESC' },
] as const;

export type SortModeIndex = 0 | 1 | 2 | 3 | 4;

/** The five filter dropdowns, in the order the Unity screen lays them out. */
export type FilterKey = 'department' | 'classification' | 'artist' | 'culture' | 'date';

export interface FilterSelection {
  /** Ids; 0 means "no filter", matching Unity's `> 0` test. */
  readonly department: number;
  readonly classification: number;
  readonly artist: number;
  /** Free-text values, not ids. Empty means "no filter". */
  readonly culture: string;
  readonly date: string;
}

export const NO_FILTERS: FilterSelection = {
  department: 0,
  classification: 0,
  artist: 0,
  culture: '',
  date: '',
};

/**
 * `"{from} to {to} of total {total} results"`, or `"No results found"`.
 * Copied verbatim from `CollectionUIManager.UpdateResultCount`.
 */
export function formatResultCount(pagination: Pagination | null): string {
  if (!pagination || pagination.total <= 0) return 'No results found';
  return `${pagination.from} to ${pagination.to} of total ${pagination.total} results`;
}

/** An artwork is usable as a puzzle only if it has an image. */
export function hasImage(item: ResultsData): boolean {
  return typeof item.primary_image === 'string' && item.primary_image.trim().length > 0;
}

/** First artist name, or an empty string. Cards show this under the title. */
export function primaryArtistName(item: ResultsData): string {
  return item.artists?.[0]?.name ?? '';
}

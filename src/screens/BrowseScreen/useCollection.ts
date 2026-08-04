import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NotConfiguredError, StaleResponseError, fetchCollection } from '../../api/client';
import {
  NO_FILTERS,
  SORT_MODES,
  type CollectionFilters,
  type FilterSelection,
  type MAPData,
  type Pagination,
  type ResultsData,
  type SortModeIndex,
} from '../../api/types';
import { ITEMS_PER_PAGE } from '../../game';

/**
 * Collection browsing state.
 *
 * Mirrors `CollectionUIManager`: search text, five filters, a sort mode and a
 * 1-based page, with every change triggering a fetch. Two behaviours matter:
 *
 * 1. **Stale responses are dropped.** `fetchCollection` carries the request-id
 *    guard; this hook additionally ignores `StaleResponseError` so a superseded
 *    request never clears the loading flag or overwrites newer data.
 * 2. **Filter lists are populated once** (`_filtersPopulated`). Later responses do
 *    not replace them, because a filtered query returns a narrowed filter set and
 *    the dropdowns would progressively lose their options.
 */

export type CollectionStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

export interface CollectionState {
  readonly status: CollectionStatus;
  readonly items: readonly ResultsData[];
  readonly pagination: Pagination | null;
  readonly filters: CollectionFilters | null;
  readonly errorMessage: string;

  readonly searchText: string;
  readonly committedSearch: string;
  readonly selection: FilterSelection;
  readonly sortIndex: SortModeIndex;
  readonly page: number;
}

export interface CollectionActions {
  /**
   * Accepts an updater as well as a plain string, so the on-screen keyboard can
   * compose several fast presses without reading a stale value.
   */
  setSearchText(text: string | ((previous: string) => string)): void;
  /** Commit the field's contents — Enter or the search button. */
  submitSearch(): void;
  clearSearch(): void;
  setFilter(key: keyof FilterSelection, value: number | string): void;
  clearFilters(): void;
  setSortIndex(index: SortModeIndex): void;
  goToPage(page: number): void;
  retry(): void;
}

const EMPTY_ITEMS: readonly ResultsData[] = [];

/**
 * @param initialSelection Filters to start with — the "Select The Collection"
 * screen passes the department the visitor chose. Read ONCE, as the initial state:
 * a later change must not clobber a filter the visitor has since edited in the
 * dropdowns, and they are free to widen or change it from inside Browse.
 */
export function useCollection(
  initialSelection: Partial<FilterSelection> = {},
): CollectionState & { actions: CollectionActions } {
  const [searchText, setSearchText] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [selection, setSelection] = useState<FilterSelection>(() => ({
    ...NO_FILTERS,
    ...initialSelection,
  }));
  const [sortIndex, setSortIndex] = useState<SortModeIndex>(0);
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);

  const [status, setStatus] = useState<CollectionStatus>('idle');
  const [data, setData] = useState<MAPData | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  /** Held separately so a narrowed response cannot shrink the dropdowns. */
  const [filters, setFilters] = useState<CollectionFilters | null>(null);
  const filtersPopulated = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');

    const sort = SORT_MODES[sortIndex] ?? SORT_MODES[0];
    const startTime = performance.now();

    void (async () => {
      try {
        const result = await fetchCollection(
          {
            limit: ITEMS_PER_PAGE,
            page,
            ...(committedSearch ? { q: committedSearch } : {}),
            ...(selection.department > 0 ? { department: selection.department } : {}),
            ...(selection.classification > 0 ? { classification: selection.classification } : {}),
            ...(selection.artist > 0 ? { artist: selection.artist } : {}),
            ...(selection.culture ? { culture: selection.culture } : {}),
            ...(selection.date ? { date: selection.date } : {}),
            ...(sort.field ? { sortBy: sort.field, sortOrder: sort.order } : {}),
          },
          { signal: controller.signal },
        );

        if (controller.signal.aborted) return;

        const duration = Math.round(performance.now() - startTime);
        console.log(`[browse] collection page ${page} loaded in ${duration}ms`);

        setData(result);
        if (!filtersPopulated.current && result.filters) {
          setFilters(result.filters);
          filtersPopulated.current = true;
        }
        setErrorMessage('');
        setStatus('ready');
      } catch (error) {
        // A superseded request must not touch state at all.
        if (error instanceof StaleResponseError) return;
        if (controller.signal.aborted) return;

        if (error instanceof NotConfiguredError) {
          setStatus('unavailable');
          setErrorMessage('The collection is unavailable. Using the artwork stored on this kiosk.');
          return;
        }

        console.error('[browse] collection fetch failed', error);
        setStatus('error');
        setErrorMessage(
          error instanceof Error ? error.message : 'Could not reach the MAP collection.',
        );
      }
    })();

    return () => controller.abort();
  }, [committedSearch, selection, sortIndex, page, reloadToken]);

  const actions = useMemo<CollectionActions>(
    () => ({
      setSearchText,
      submitSearch: () => {
        setCommittedSearch(searchText.trim());
        setPage(1); // A new query always starts at page 1.
      },
      clearSearch: () => {
        setSearchText('');
        setCommittedSearch('');
        setPage(1);
      },
      setFilter: (key, value) => {
        setSelection((current) => ({ ...current, [key]: value }));
        setPage(1);
      },
      clearFilters: () => {
        setSelection(NO_FILTERS);
        setPage(1);
      },
      setSortIndex: (index) => {
        setSortIndex(index);
        setPage(1);
      },
      goToPage: (next) => setPage(Math.max(1, next)),
      retry: () => setReloadToken((token) => token + 1),
    }),
    [searchText],
  );

  const goToPage = useCallback(
    (next: number) => {
      const last = data?.results.pagination.last_page ?? 1;
      setPage(Math.min(Math.max(1, next), Math.max(1, last)));
    },
    [data],
  );

  return {
    status,
    items: data?.results.data ?? EMPTY_ITEMS,
    pagination: data?.results.pagination ?? null,
    filters,
    errorMessage,
    searchText,
    committedSearch,
    selection,
    sortIndex,
    page,
    actions: { ...actions, goToPage },
  };
}

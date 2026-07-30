import { useMemo, useRef, useState } from 'react';
import {
  SORT_MODES,
  formatResultCount,
  hasImage,
  type FilterSelection,
  type ResultsData,
  type SortModeIndex,
} from '../../api/types';
import { BROWSE_PORTRAIT as B } from '../../layout/browse';
import { rectStyle, textStyle } from '../../layout/rect';
import { ArtworkCard } from './ArtworkCard';
import { FilterDropdown, type DropdownOption } from './FilterDropdown';
import { useCollection } from './useCollection';
import { OnScreenKeyboard } from '../../ui/keyboard/OnScreenKeyboard';
import { isTap, keyboardHeight } from '../../ui/keyboard/layout';
import styles from './BrowseScreen.module.css';

/**
 * Browse & Discover — search, five searchable filters, sort, paginated card grid.
 *
 * Geometry comes from `src/layout/browse.ts`, transcribed from the scene dump.
 */

interface BrowseScreenProps {
  readonly onBack: () => void;
  /** A card was tapped — Phase 4 takes this to the Crop screen. */
  readonly onSelectArtwork: (item: ResultsData) => void;
}

export function BrowseScreen({ onBack, onSelectArtwork }: BrowseScreenProps) {
  const collection = useCollection();
  const { actions } = collection;

  /** At most one popup open at a time, like a Unity `TMP_Dropdown`. */
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  /**
   * Which field the on-screen keyboard is serving: the main search box, or the
   * search input inside one filter popup. `null` means the keyboard is closed.
   */
  const [keyboardTarget, setKeyboardTarget] = useState<'search' | { filter: string } | null>(null);

  /** Popup search text, per dropdown. Lifted so the keyboard can drive it. */
  const [filterSearch, setFilterSearch] = useState<Record<string, string>>({});

  const setOneFilterSearch = (key: string, next: string | ((previous: string) => string)) =>
    setFilterSearch((current) => ({
      ...current,
      [key]: typeof next === 'function' ? next(current[key] ?? '') : next,
    }));

  /**
   * Route the keyboard's updater to whichever field it is serving. An updater
   * rather than a value, so fast typing composes instead of overwriting.
   */
  const applyKeyboardEdit = (updater: (previous: string) => string) => {
    if (keyboardTarget === null) return;
    if (keyboardTarget === 'search') actions.setSearchText(updater);
    else setOneFilterSearch(keyboardTarget.filter, updater);
  };

  /**
   * Pointer-down position, for the tap-versus-drag test on dismiss.
   * `HandleKeyboardDismiss`: on pointer UP, a movement under 15 px is a tap and
   * closes the keyboard; a drag is a scroll and must not (docs/ui-spec.md §5).
   */
  const dismissStart = useRef<{ x: number; y: number } | null>(null);

  const handleBackdropPointerDown = (event: React.PointerEvent) => {
    setOpenDropdown(null);
    dismissStart.current = { x: event.clientX, y: event.clientY };
  };

  const handleBackdropPointerUp = (event: React.PointerEvent) => {
    const start = dismissStart.current;
    dismissStart.current = null;
    if (!start || keyboardTarget === null) return;

    // A tap on an input re-targets rather than dismissing; those elements stop
    // propagation themselves, so anything reaching here is outside them.
    if (isTap(start.x, start.y, event.clientX, event.clientY)) setKeyboardTarget(null);
  };

  const optionsFor = useMemo<Record<string, readonly DropdownOption[]>>(() => {
    const filters = collection.filters;
    if (!filters) {
      return { department: [], classification: [], artist: [], culture: [], date: [] };
    }

    return {
      department: filters.department.map((entry) => ({ value: entry.id, label: entry.dept })),
      classification: filters.classification.map((entry) => ({
        value: entry.id,
        label: entry.class,
      })),
      artist: filters.artist.map((entry) => ({ value: entry.id, label: entry.name })),
      // culture and date filter by their VALUE, not their id (game-logic §8.4).
      culture: filters.culture.map((entry) => ({ value: entry.culture, label: entry.culture })),
      date: filters.date.map((entry) => ({ value: entry.date, label: entry.date })),
    };
  }, [collection.filters]);

  const pagination = collection.pagination;
  const canPrev = collection.page > 1;
  const canNext = pagination ? collection.page < pagination.last_page : false;

  // Only artworks with an image can become a puzzle (game-logic §8.6).
  const playable = collection.items.filter(hasImage);

  const filtersActive =
    collection.selection.department > 0 ||
    collection.selection.classification > 0 ||
    collection.selection.artist > 0 ||
    collection.selection.culture !== '' ||
    collection.selection.date !== '';

  return (
    <div
      className={styles.screen}
      style={rectStyle(B.screen.rect)}
      // Tapping anywhere outside a popup closes it, and a TAP (not a drag)
      // outside an input also dismisses the keyboard.
      onPointerDown={handleBackdropPointerDown}
      onPointerUp={handleBackdropPointerUp}
    >
      <img className={styles.background} src={B.screen.background} alt="" draggable={false} />

      <img
        className={styles.logo}
        style={rectStyle(B.appLogo.rect)}
        src={B.appLogo.sprite}
        alt="Museum of Art & Photography"
        draggable={false}
      />

      <button
        type="button"
        className={styles.iconButton}
        style={{ ...rectStyle(B.backButton.rect), opacity: B.backButton.opacity }}
        onClick={onBack}
        aria-label="Back"
      >
        <img src={B.backButton.sprite} alt="" draggable={false} />
      </button>

      {/* ---- Search ---- */}
      <div
        className={styles.searchBar}
        style={rectStyle(B.searchBar.rect)}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className={styles.searchField} style={{ borderColor: B.searchBar.outlineColour }}>
          <input
            className={styles.searchInput}
            style={{
              ...textStyle(B.searchBar.input),
              // Text Area is inset by 40 px each side (sizeDelta −80).
              paddingLeft: '40px',
              paddingRight: '40px',
            }}
            value={collection.searchText}
            placeholder={B.searchBar.placeholder.text}
            onChange={(event) => actions.setSearchText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') actions.submitSearch();
            }}
            // Focus opens the in-app keyboard (ADR-006). `readOnly` would block
            // a physical keyboard, which staff use for setup, so both work.
            onFocus={() => setKeyboardTarget('search')}
            onPointerDown={(event) => {
              event.stopPropagation();
              setKeyboardTarget('search');
            }}
            autoComplete="off"
            spellCheck={false}
            aria-label="Search the collection"
          />

          {/* Visible only when the field has text (UpdateSearchControls). */}
          {collection.searchText ? (
            <button
              type="button"
              className={styles.searchClear}
              style={rectStyle(B.searchBar.clearButtonRect)}
              onClick={actions.clearSearch}
              aria-label="Clear the search"
            >
              <img src={B.searchBar.clearSprite} alt="" draggable={false} />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          className={styles.searchSubmit}
          style={rectStyle(B.searchBar.searchButtonRect)}
          onClick={actions.submitSearch}
          aria-label="Search"
        >
          <img src={B.searchBar.searchSprite} alt="" draggable={false} />
        </button>
      </div>

      {/* ---- Filters ---- */}
      <div
        className={styles.filterBar}
        style={rectStyle(B.filterBar.rect)}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <span className={styles.filterTitle} style={{ ...rectStyle(B.filterBar.titleRect), ...textStyle(B.filterBar.title) }}>
          {B.filterBar.title.text}
        </span>

        <button
          type="button"
          className={styles.clearFilters}
          style={{ ...rectStyle(B.filterBar.clearFiltersRect), ...textStyle(B.filterBar.clearFilters) }}
          onClick={actions.clearFilters}
          disabled={!filtersActive}
        >
          {B.filterBar.clearFilters.text}
        </button>

        {B.filterDropdowns.items.map((item) => (
          <FilterDropdown
            key={item.key}
            label={item.label}
            posX={item.posX}
            options={optionsFor[item.key] ?? []}
            selected={collection.selection[item.key as keyof FilterSelection]}
            onSelect={(value) => {
              actions.setFilter(item.key as keyof FilterSelection, value);
              setOpenDropdown(null);
            }}
            open={openDropdown === item.key}
            onToggle={() => {
              const next = openDropdown === item.key ? null : item.key;
              setOpenDropdown(next);
              // Closing the popup takes its keyboard with it.
              if (next === null) setKeyboardTarget(null);
            }}
            disabled={collection.filters === null}
            search={filterSearch[item.key] ?? ''}
            onSearchChange={(next) => setOneFilterSearch(item.key, next)}
            onSearchFocus={() => setKeyboardTarget({ filter: item.key })}
          />
        ))}
      </div>

      {/* ---- Result count + sort ---- */}
      <div className={styles.resultBar} style={rectStyle(B.resultInfoBar.rect)}>
        <span
          className={styles.resultCount}
          style={{ ...rectStyle(B.resultInfoBar.countRect), ...textStyle(B.resultInfoBar.count) }}
        >
          {collection.status === 'loading' ? 'Loading...' : formatResultCount(pagination)}
        </span>

        <div
          className={styles.sortWrapper}
          style={rectStyle(B.resultInfoBar.sortRect)}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span
            className={styles.sortLabel}
            style={{ ...rectStyle(B.resultInfoBar.sortLabelRect), ...textStyle(B.resultInfoBar.sortLabel) }}
          >
            {B.resultInfoBar.sortLabel.text}
          </span>

          <select
            className={styles.sortSelect}
            style={{ fontSize: `${B.filterDropdowns.label.fontSizePx}px` }}
            value={collection.sortIndex}
            onChange={(event) =>
              actions.setSortIndex(Number(event.target.value) as SortModeIndex)
            }
            aria-label="Sort by"
          >
            {SORT_MODES.map((mode, index) => (
              <option key={mode.label} value={index}>
                {mode.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ---- Card grid ---- */}
      <div className={styles.cardContainer} style={rectStyle(B.cardArea.containerRect)}>
        <button
          type="button"
          className={styles.pageArrow}
          style={rectStyle(B.cardArea.prevButtonRect)}
          onClick={() => actions.goToPage(collection.page - 1)}
          disabled={!canPrev}
          aria-label="Previous page"
        >
          <img
            src={B.cardArea.arrowSprite}
            alt=""
            draggable={false}
            style={{ width: `${B.cardArea.arrowSize}px`, height: `${B.cardArea.arrowSize}px` }}
          />
        </button>

        <div className={styles.cardScroll} style={rectStyle(B.cardArea.scrollRect)}>
          {collection.status === 'unavailable' || collection.status === 'error' ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyMessage}>{collection.errorMessage}</p>
              {collection.status === 'error' ? (
                <button type="button" className={styles.retryButton} onClick={actions.retry}>
                  Try again
                </button>
              ) : null}
            </div>
          ) : playable.length === 0 && collection.status === 'ready' ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyMessage}>No results found</p>
            </div>
          ) : (
            <div
              className={styles.cardGrid}
              style={{
                // UpdateGridCellSize: target 320 px cells, minimum 2 columns,
                // square. auto-fill + minmax reproduces it in one declaration.
                gridTemplateColumns: `repeat(auto-fill, minmax(${B.cardArea.targetCellSizePx}px, 1fr))`,
                gap: `${B.cardArea.gapPx}px`,
              }}
            >
              {playable.map((item) => (
                <ArtworkCard key={item.id} item={item} onSelect={onSelectArtwork} />
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className={styles.pageArrow}
          style={rectStyle(B.cardArea.nextButtonRect)}
          onClick={() => actions.goToPage(collection.page + 1)}
          disabled={!canNext}
          aria-label="Next page"
        >
          <img
            className={styles.arrowFlipped}
            src={B.cardArea.arrowSprite}
            alt=""
            draggable={false}
            style={{ width: `${B.cardArea.arrowSize}px`, height: `${B.cardArea.arrowSize}px` }}
          />
        </button>
      </div>

      {/* ---- Pagination ---- */}
      <div className={styles.paginationBar} style={rectStyle(B.pagination.rect)}>
        <span className={styles.pageInfo} style={textStyle(B.pagination.info)}>
          {pagination ? `Page ${pagination.current_page} of ${pagination.last_page}` : ''}
        </span>
      </div>

      {/* ---- On-screen keyboard ----
          Anchored to the bottom of the screen and centred. Rendered last so it
          sits above the grid and the pagination bar. */}
      {keyboardTarget !== null ? (
        <div className={styles.keyboardDock} style={{ bottom: '0px', height: `${keyboardHeight()}px` }}>
          <OnScreenKeyboard
            onChange={applyKeyboardEdit}
            onSubmit={() => {
              // Submitting the main field runs the query; a filter popup's field
              // only narrows its own list, so there is nothing to submit there.
              if (keyboardTarget === 'search') actions.submitSearch();
              setKeyboardTarget(null);
            }}
            onClose={() => setKeyboardTarget(null)}
          />
        </div>
      ) : null}
    </div>
  );
}

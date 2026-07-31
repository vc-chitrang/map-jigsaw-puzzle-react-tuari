import { useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  formatResultCount,
  hasImage,
  type FilterSelection,
  type ResultsData,
} from '../../api/types';
import { ORIENTATION } from '../../canvas/reference';
import { BROWSE_LAYOUT } from '../../layout/screens';
import { rectStyle, textStyle } from '../../layout/rect';
import { ArtworkCard } from './ArtworkCard';
import { FilterDropdown, type DropdownOption } from './FilterDropdown';
import { SortDropdown } from './SortDropdown';
import { useCollection } from './useCollection';
import { isTap } from '../../ui/pointer';
import styles from './BrowseScreen.module.css';

/**
 * Browse & Discover — search, five searchable filters, sort, paginated card grid.
 *
 * Geometry comes from `src/layout/browse.ts` (portrait) or
 * `src/layout/browse-landscape.ts`, both transcribed from the scene dumps and
 * selected by orientation in `src/layout/screens.ts`.
 */

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '...', current - 1, current, current + 1, '...', total];
}

const B = BROWSE_LAYOUT[ORIENTATION];

interface BrowseScreenProps {
  readonly onBack: () => void;
  /** A card was tapped — Phase 4 takes this to the Crop screen. */
  readonly onSelectArtwork: (item: ResultsData) => void;
}

export function BrowseScreen({ onBack, onSelectArtwork }: BrowseScreenProps) {
  const collection = useCollection();
  const { actions } = collection;

  /**
   * At most one popup open at a time, like a Unity `TMP_Dropdown`. Holds a
   * filter key or the literal `'sort'` — the sort control shares this state so
   * it cannot be open alongside a filter popup.
   */
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  /** Popup search text, per dropdown. */
  const [filterSearch, setFilterSearch] = useState<Record<string, string>>({});

  const setOneFilterSearch = (key: string, next: string) =>
    setFilterSearch((current) => ({ ...current, [key]: next }));

  /**
   * Dismiss the Windows touch keyboard by giving up focus.
   *
   * The app no longer ships its own keyboard (ADR-049): the kiosk uses the Windows
   * TabTip keyboard only, and TabTip is driven ENTIRELY by focus. Windows raises it
   * when an editable field takes focus and hides it when that focus goes, so
   * blurring is the whole of "close the keyboard". Nothing is toggled directly —
   * `ITipInvocation.Toggle` is a blind flip that double-fired, which is what made
   * the Unity build's keyboard blink (ADR-006).
   */
  const dismissKeyboard = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    invoke('close_tabtip').catch((e) => console.warn('Failed to close keyboard', e));
  };

  /**
   * Open exactly one popup (or none), and let the keyboard go with it.
   *
   * Every route into a popup goes through here: touching a dropdown control,
   * choosing an option, or Clear Filters. The keyboard covers a third of the
   * screen, so leaving it up over a list the visitor is now reading hides most of
   * it — and if it was serving the popup that just closed, it would be typing into
   * a field that no longer exists.
   */
  const showOnly = (next: string | null) => {
    setOpenDropdown(next);
    dismissKeyboard();
  };

  /**
   * Pointer-down position, for the tap-versus-drag test on dismiss.
   * `HandleKeyboardDismiss`: on pointer UP, a movement under 15 px is a tap and
   * dismisses; a drag is a scroll and must not (docs/ui-spec.md §5).
   */
  const dismissStart = useRef<{ x: number; y: number } | null>(null);

  const handleBackdropPointerDown = (event: React.PointerEvent) => {
    setOpenDropdown(null);
    dismissStart.current = { x: event.clientX, y: event.clientY };
  };

  const handleBackdropPointerUp = (event: React.PointerEvent) => {
    const start = dismissStart.current;
    dismissStart.current = null;
    if (!start) return;

    // A tap on an input keeps focus (those elements stop propagation themselves),
    // so anything reaching here is outside them and should drop the keyboard.
    if (isTap(start.x, start.y, event.clientX, event.clientY)) dismissKeyboard();
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
  const isLoading = collection.status === 'loading';
  const canPrev = !isLoading && collection.page > 1;
  const canNext = !isLoading && (pagination ? collection.page < pagination.last_page : false);

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
        // Touching anywhere in the search bar — the field, its clear button or
        // the submit button — closes an open filter/sort popup. Handled on the
        // BAR rather than on each control so one rule covers all three, which
        // means nothing inside may stopPropagation before it reaches here.
        // stopPropagation then keeps the backdrop from dismissing the keyboard
        // that the field is about to ask for.
        onPointerDown={(event) => {
          event.stopPropagation();
          setOpenDropdown(null);
        }}
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
            // Focus is what raises the Windows TabTip keyboard (ADR-049), so this
            // field must stay a real focusable <input> — `readOnly` would suppress
            // both TabTip and the physical keyboard staff use for setup.
            // Deliberately does NOT stopPropagation: the event must reach the
            // search bar's handler above, which is what closes an open popup.
            autoComplete="off"
            spellCheck={false}
            aria-label="Search the collection"
            inputMode="none"
            onFocus={() => invoke('open_tabtip').catch((e) => console.warn('Failed to open keyboard', e))}
          />

          {/* Visible only when the field has text (UpdateSearchControls). */}
          {collection.searchText ? (
            <button
              type="button"
              className={styles.searchClear}
              style={rectStyle(B.searchBar.clearButtonRect)}
              onClick={() => {
                // Clearing the field is the end of typing, so the keyboard goes.
                actions.clearSearch();
                dismissKeyboard();
              }}
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
          onClick={() => {
            // Submitting is the end of typing, so the keyboard goes.
            actions.submitSearch();
            dismissKeyboard();
          }}
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
          onClick={() => {
            // Clearing the filters closes whatever popup and keyboard were being
            // used to set them — the lists behind are all about to change.
            showOnly(null);
            actions.clearFilters();
          }}
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
              showOnly(null);
            }}
            open={openDropdown === item.key}
            onToggle={() => showOnly(openDropdown === item.key ? null : item.key)}
            disabled={collection.filters === null}
            search={filterSearch[item.key] ?? ''}
            onSearchChange={(next) => setOneFilterSearch(item.key, next)}
          />
        ))}
      </div>

      {/* ---- Result count + sort ---- */}
      <div className={styles.resultBar} style={rectStyle(B.resultInfoBar.rect)}>
        <span
          className={styles.resultCount}
          style={{ ...rectStyle(B.resultInfoBar.countRect), ...textStyle(B.resultInfoBar.count) }}
        >
          {isLoading ? 'Loading...' : formatResultCount(pagination)}
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

          <SortDropdown
            value={collection.sortIndex}
            open={openDropdown === 'sort'}
            onToggle={() => showOnly(openDropdown === 'sort' ? null : 'sort')}
            onChange={(next) => {
              actions.setSortIndex(next);
              showOnly(null);
            }}
          />
        </div>

        {/* GridViewButton — visual only (one grid view; nothing to switch). */}
        <img
          className={styles.gridViewButton}
          style={rectStyle(B.resultInfoBar.gridViewRect)}
          src={B.resultInfoBar.gridViewSprite}
          alt=""
          aria-hidden="true"
        />
      </div>

      {/* ---- Card grid ---- */}
      <div className={styles.cardContainer} style={rectStyle(B.cardArea.containerRect)}>
        {isLoading && playable.length > 0 ? (
          <div className={styles.loadingOverlay}>
            <div className={styles.loadingSpinner} aria-hidden="true" />
            <span>Loading Page {collection.page}...</span>
          </div>
        ) : null}

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

        <div
          className={`${styles.cardScroll} ${isLoading ? styles.blurLoading : ''}`}
          style={rectStyle(B.cardArea.scrollRect)}
        >
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
                // square. auto-fill + minmax reproduces it in one declaration,
                // and SetupGridLayout's padding is asymmetric at the bottom.
                gridTemplateColumns: `repeat(auto-fill, minmax(${B.cardArea.targetCellSizePx}px, 1fr))`,
                gap: `${B.cardArea.gapPx}px`,
                padding: `${B.cardArea.paddingPx.top}px ${B.cardArea.paddingPx.right}px ${B.cardArea.paddingPx.bottom}px ${B.cardArea.paddingPx.left}px`,
              }}
            >
              {isLoading && playable.length === 0
                ? Array.from({ length: 12 }, (_, i) => (
                    <div key={i} className={styles.skeletonCard}>
                      <div className={styles.cardSpinner} aria-hidden="true" />
                    </div>
                  ))
                : playable.map((item) => (
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
        {pagination && pagination.last_page > 1 ? (
          <div className={styles.pageNumbers}>
            {getPageNumbers(collection.page, pagination.last_page).map((item, index) =>
              item === '...' ? (
                <span key={`ellipsis-${index}`} className={styles.pageEllipsis}>
                  ...
                </span>
              ) : (
                <button
                  key={`page-${item}`}
                  type="button"
                  className={`${styles.pagePill} ${
                    item === collection.page ? styles.pagePillActive : ''
                  }`}
                  onClick={() => actions.goToPage(Number(item))}
                  disabled={isLoading}
                >
                  {item}
                </button>
              ),
            )}
          </div>
        ) : null}

        <span className={styles.pageInfo} style={textStyle(B.pagination.info)}>
          {isLoading
            ? `Loading...`
            : pagination
            ? `Page ${pagination.current_page} of ${pagination.last_page}`
            : ''}
        </span>
      </div>

      {/* No on-screen keyboard is rendered. The kiosk uses the Windows TabTip
          keyboard only (ADR-049), which Windows raises and hides from field focus —
          shipping one as well put TWO keyboards on screen at once. */}
    </div>
  );
}

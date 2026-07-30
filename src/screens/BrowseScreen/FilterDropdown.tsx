import { useMemo, type CSSProperties } from 'react';
import { BROWSE_PORTRAIT as B } from '../../layout/browse';
import { rectStyle, textStyle } from '../../layout/rect';
import styles from './BrowseScreen.module.css';

/**
 * One filter dropdown with a **searchable** popup.
 *
 * Unity attaches a `DropdownSearchController` to each of the five filter
 * dropdowns, giving every popup its own input and clear button (ui-spec §5). The
 * artist list in particular is far too long to scroll on a kiosk.
 *
 * The popup is a plain absolutely-positioned panel rather than a portal: it lives
 * inside the scaled canvas, so it must scale with everything else, and a portal to
 * `document.body` would escape that transform.
 */

export interface DropdownOption {
  /** Id for the three id-based filters, or the literal string for culture/date. */
  readonly value: number | string;
  readonly label: string;
}

/**
 * Case-insensitive substring match on the option label.
 *
 * Exported and pure so it is unit-testable: this is the whole reason the artist
 * dropdown (2,022 options in the live response) is usable on a kiosk, and a
 * regression here would be invisible until someone tried to find an artist.
 */
export function filterOptions(
  options: readonly DropdownOption[],
  search: string,
): readonly DropdownOption[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((option) => option.label.toLowerCase().includes(needle));
}

interface FilterDropdownProps {
  readonly label: string;
  readonly posX: number;
  readonly options: readonly DropdownOption[];
  readonly selected: number | string;
  readonly onSelect: (value: number | string) => void;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly disabled?: boolean;
  /**
   * The popup's search text is CONTROLLED by the parent so the shared on-screen
   * keyboard can drive it. Keeping it local would mean either a keyboard per
   * popup (there is no room — the popup is 400 px tall) or two sources of truth.
   */
  readonly search: string;
  readonly onSearchChange: (next: string) => void;
  /** The visitor tapped the popup's search field; aim the keyboard at it. */
  readonly onSearchFocus: () => void;
}

const D = B.filterDropdowns;

export function FilterDropdown({
  label,
  posX,
  options,
  selected,
  onSelect,
  open,
  onToggle,
  disabled = false,
  search,
  onSearchChange,
  onSearchFocus,
}: FilterDropdownProps) {
  const controlStyle: CSSProperties = rectStyle({
    kind: 'point',
    anchor: { x: 0, y: 1 },
    pos: { x: posX, y: D.posY },
    size: D.size,
    pivot: { x: 0.5, y: 0.5 },
  });

  const visible = useMemo(() => filterOptions(options, search), [options, search]);

  // The control shows the selection when there is one, otherwise its own name.
  const current = options.find((option) => option.value === selected);
  const displayText = current ? current.label : label;
  const hasSelection = current !== undefined;

  return (
    <div className={styles.dropdownRoot} style={controlStyle}>
      <button
        type="button"
        className={styles.dropdownControl}
        onClick={onToggle}
        disabled={disabled}
        aria-expanded={open}
        aria-label={label}
      >
        <span
          className={`${styles.dropdownLabel} ${hasSelection ? styles.dropdownLabelActive : ''}`}
          style={textStyle({ ...D.label, marginPx: D.labelMarginPx })}
        >
          {displayText}
        </span>
        <img
          className={styles.dropdownArrow}
          src={D.arrowSprite}
          alt=""
          draggable={false}
          style={{
            width: `${D.arrowSize}px`,
            height: `${D.arrowSize}px`,
            right: `${D.arrowInset}px`,
          }}
        />
      </button>

      {open ? (
        <div
          className={styles.dropdownPopup}
          style={{ top: `calc(100% + ${D.popupGap}px)`, height: `${D.popupHeight}px` }}
        >
          <div className={styles.dropdownSearchRow}>
            <input
              className={styles.dropdownSearch}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={`Search ${label.toLowerCase()}...`}
              style={{ fontSize: `${D.label.fontSizePx}px` }}
              onFocus={onSearchFocus}
              onPointerDown={(event) => {
                // Must not reach the backdrop, which would dismiss the keyboard.
                event.stopPropagation();
                onSearchFocus();
              }}
              autoComplete="off"
              spellCheck={false}
            />
            {search ? (
              <button
                type="button"
                className={styles.dropdownSearchClear}
                onClick={() => onSearchChange('')}
                aria-label="Clear the filter search"
              >
                ×
              </button>
            ) : null}
          </div>

          <ul className={styles.dropdownList} style={{ ['--row-height' as string]: `${D.popupRowHeight}px` }}>
            {/* "Any" clears this one filter without touching the others. */}
            <li>
              <button
                type="button"
                className={styles.dropdownItem}
                style={{ fontSize: `${D.label.fontSizePx}px` }}
                onClick={() => {
                  onSelect(typeof selected === 'number' ? 0 : '');
                  onSearchChange('');
                }}
              >
                Any {label.toLowerCase()}
                {!hasSelection ? <span className={styles.dropdownTick}>✓</span> : null}
              </button>
            </li>

            {visible.map((option) => (
              <li key={String(option.value)}>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  style={{ fontSize: `${D.label.fontSizePx}px` }}
                  onClick={() => {
                    onSelect(option.value);
                    onSearchChange('');
                  }}
                >
                  {option.label}
                  {option.value === selected ? <span className={styles.dropdownTick}>✓</span> : null}
                </button>
              </li>
            ))}

            {visible.length === 0 ? (
              <li
                className={styles.dropdownEmpty}
                style={{ fontSize: `${D.label.fontSizePx}px` }}
              >
                No matches
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

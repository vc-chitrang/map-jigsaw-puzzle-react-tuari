import { SORT_MODES, type SortModeIndex } from '../../api/types';
import { ORIENTATION } from '../../canvas/reference';
import { BROWSE_LAYOUT } from '../../layout/screens';
import { textStyle } from '../../layout/rect';
import styles from './BrowseScreen.module.css';

/**
 * "Sort By" dropdown.
 *
 * This was a native `<select>`, chosen because its five options are short and
 * fixed and the OS draws the popup, which sidesteps clipping. That was wrong on
 * a scaled kiosk canvas: the OS popup is NOT inside `<ScaledCanvas>`, so its
 * rows render at OS size — roughly 4x the surrounding UI at the kiosk's scale
 * factor — and it is free to position itself over the Date filter popup, so two
 * menus could be open and overlapping at once.
 *
 * It is now an in-canvas panel built from the same classes as `FilterDropdown`,
 * and it shares that component's `openDropdown` state, so at most one popup is
 * ever open. No search row: five fixed options need no filtering.
 */

const D = BROWSE_LAYOUT[ORIENTATION].filterDropdowns;

interface SortDropdownProps {
  readonly value: SortModeIndex;
  readonly onChange: (next: SortModeIndex) => void;
  readonly open: boolean;
  readonly onToggle: () => void;
}

export function SortDropdown({ value, onChange, open, onToggle }: SortDropdownProps) {
  const current = SORT_MODES[value] ?? SORT_MODES[0];

  return (
    <div className={styles.sortRoot}>
      <button
        type="button"
        className={styles.dropdownControl}
        onClick={onToggle}
        aria-expanded={open}
        aria-label="Sort by"
      >
        <span
          className={styles.dropdownLabel}
          style={textStyle({ ...D.label, marginPx: D.labelMarginPx })}
        >
          {current.label}
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
          style={{
            top: `calc(100% + ${D.popupGap}px)`,
            // Sized to its content rather than the filter popups' fixed 400 px:
            // there are exactly five options and no search row, so a taller box
            // would just be empty space over the grid.
            height: `${SORT_MODES.length * D.popupRowHeight}px`,
          }}
        >
          <ul
            className={styles.dropdownList}
            style={{ ['--row-height' as string]: `${D.popupRowHeight}px` }}
          >
            {SORT_MODES.map((mode, index) => (
              <li key={mode.label}>
                <button
                  type="button"
                  className={styles.dropdownItem}
                  style={{ fontSize: `${D.label.fontSizePx}px` }}
                  onClick={() => onChange(index as SortModeIndex)}
                >
                  <span className={styles.dropdownItemLabel}>{mode.label}</span>
                  {index === value ? <span className={styles.dropdownTick}>✓</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

import styles from './LoadingOverlay.module.css';

/**
 * Full-screen loading scrim with the 27-frame sprite-sheet animation (ADR-032).
 *
 * Fills its nearest positioned ancestor, so a screen root gets a full-screen
 * cover and a panel gets a panel-sized one.
 *
 * The Browse screen still carries its own copy of this overlay, because it also
 * blurs the grid behind it and disables the page arrows — a different job from
 * "the screen is not ready yet". Only the animation is duplicated; worth folding
 * together if a third caller appears.
 */

interface LoadingOverlayProps {
  /** Shown under the spinner. Omit for a spinner on its own. */
  readonly label?: string;
  /** Spinner edge in reference px. */
  readonly sizePx?: number;
  /**
   * Raise above a screen's own layered UI.
   *
   * The default z-index clears the board, the preview panel and the win popup, but
   * not the Browse screen's dropdown popups (60) or keyboard dock (100). An
   * app-level overlay covering a whole screen needs to beat those too.
   */
  readonly elevated?: boolean;
}

export function LoadingOverlay({ label, sizePx = 400, elevated = false }: LoadingOverlayProps = {}) {
  return (
    <div
      className={`${styles.overlay} ${elevated ? styles.elevated : ''}`}
      role="status"
      aria-live="polite"
    >
      <div
        className={styles.spinner}
        style={{ width: `${sizePx}px`, height: `${sizePx}px` }}
        aria-hidden="true"
      />
      {label ? <span className={styles.label}>{label}</span> : null}
    </div>
  );
}

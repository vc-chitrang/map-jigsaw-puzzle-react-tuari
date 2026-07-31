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
}

export function LoadingOverlay({ label, sizePx = 400 }: LoadingOverlayProps = {}) {
  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      <div
        className={styles.spinner}
        style={{ width: `${sizePx}px`, height: `${sizePx}px` }}
        aria-hidden="true"
      />
      {label ? <span className={styles.label}>{label}</span> : null}
    </div>
  );
}

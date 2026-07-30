import { ORIENTATION } from '../canvas/reference';
import styles from './VersionBadge.module.css';

/**
 * Build version, bottom-left of the screen.
 *
 * Deliberately OUTSIDE `<ScaledCanvas>`: it is a build marker for testing, not
 * part of the Unity UI. Keeping it in the viewport layer means
 *
 *   * it sits in the true screen corner at any window size or aspect ratio,
 *     rather than the canvas corner, which an off-aspect display would clip, and
 *   * it never participates in the scaled layout, so it cannot shift anything
 *     the pixel-parity diff measures.
 *
 * It does still add pixels to a capture, so set `VITE_HIDE_VERSION=1` when
 * producing parity captures.
 *
 * The version comes from `__APP_VERSION__`, injected by vite.config.ts from
 * package.json. `scripts/bump-version.ps1` is what changes it.
 *
 * The ORIENTATION is shown alongside it for two reasons:
 *
 *   * Support: portrait and landscape ship as two separate installers (ADR-020),
 *     and otherwise there is no way to tell from a running kiosk which one is
 *     installed — both artefacts have the same version and the same window.
 *   * Verification: both layout tables are bundled in either build and a single
 *     module-scope constant selects between them, which the minifier folds away.
 *     Without this string, nothing in the built output distinguishes the two
 *     bundles, so a mis-built installer would be invisible until someone launched
 *     it on the kiosk.
 */
export function VersionBadge() {
  if (import.meta.env.VITE_HIDE_VERSION === '1') return null;

  return (
    <span className={styles.badge} aria-hidden="true">
      v{__APP_VERSION__} · {ORIENTATION}
    </span>
  );
}

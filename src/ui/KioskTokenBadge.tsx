import { useKioskToken } from '../kiosk/useKioskToken';
import styles from './KioskTokenBadge.module.css';

/**
 * Bottom-right corner — the kiosk's own upload token, in the clear.
 *
 * Support needs to read this off a live screen to diagnose "why is nothing
 * appearing on kiosk 3" (compare it against the `kiosks` map from the server's
 * `GET /` diagnostic endpoint), so it is shown in full, not truncated.
 *
 * Hidden by the same `VITE_HIDE_VERSION` flag as `VersionBadge` for the same
 * reason: a pixel-parity capture is diffed against a Unity build that has no
 * such concept, so any always-on debug chrome counts against that budget. One
 * flag for "hide the debug corner" rather than a second env var for the same
 * purpose.
 */
export function KioskTokenBadge() {
  const token = useKioskToken();
  if (import.meta.env.VITE_HIDE_VERSION === '1') return null;
  if (!token) return null;

  return (
    <span className={styles.badge} aria-hidden="true">
      kiosk: {token}
    </span>
  );
}

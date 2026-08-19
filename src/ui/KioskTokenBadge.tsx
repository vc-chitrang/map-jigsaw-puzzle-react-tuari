import { useKioskToken } from '../kiosk/useKioskToken';
import styles from './KioskTokenBadge.module.css';

/**
 * Bottom-right corner — the kiosk's own upload token, in the clear.
 *
 * OFF by default (client request, 2026-08-14) — the token stays visible in
 * the console regardless (`[socket] subscribed to <token>`, `src/api/socket.ts`),
 * so support can still retrieve it from logs without this on-screen badge.
 * Set `VITE_SHOW_KIOSK_TOKEN=1` to opt back into the on-screen badge if a
 * future debugging session needs to read it directly off a live kiosk screen
 * (compare it against the `kiosks` map from the server's `GET /` diagnostic
 * endpoint) without pulling logs.
 */
export function KioskTokenBadge() {
  const token = useKioskToken();
  if (import.meta.env.VITE_SHOW_KIOSK_TOKEN !== '1') return null;
  if (!token) return null;

  return (
    <span className={styles.badge} aria-hidden="true">
      kiosk: {token}
    </span>
  );
}

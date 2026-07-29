/**
 * Per-artwork high score — docs/game-logic.md §7.
 *
 * The key shape is preserved EXACTLY so existing kiosk records can be migrated
 * out of Unity `PlayerPrefs`:
 *
 *   {productName}_HighScoreKey_{artworkTitle | textureName | "Default"}
 *
 * The score is therefore per artwork, not global and not per grid size.
 */

import { NO_HIGH_SCORE, PRODUCT_NAME } from './constants';
import { formatTime } from './timer';

/**
 * The subset of `Storage` this module needs.
 *
 * Injected rather than reaching for `localStorage`, so `src/game/` stays free of
 * browser globals and the Tauri store can be swapped in for kiosk-resilient
 * persistence without touching this logic (docs/architecture.md §3).
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ArtworkIdentity {
  /** Collection artwork title. Empty for QR uploads. */
  readonly artworkTitle?: string | undefined;
  /** Fallback name of a bundled local texture. */
  readonly textureName?: string | undefined;
}

/** `artworkTitle` if non-empty, else `textureName`, else `"Default"`. */
export function resolveIdentifier(identity: ArtworkIdentity = {}): string {
  const title = identity.artworkTitle?.trim();
  if (title) return title;

  const texture = identity.textureName?.trim();
  if (texture) return texture;

  return 'Default';
}

export function highScoreKey(identity: ArtworkIdentity = {}, productName = PRODUCT_NAME): string {
  return `${productName}_HighScoreKey_${resolveIdentifier(identity)}`;
}

/**
 * Read the stored best time in seconds.
 *
 * @returns seconds, or `NO_HIGH_SCORE` (-1) when unset or unparseable. A corrupt
 * value is treated as "no record" rather than throwing — a kiosk must not fail to
 * start because one localStorage entry got mangled.
 */
export function readHighScore(
  store: KeyValueStore,
  identity: ArtworkIdentity = {},
  productName = PRODUCT_NAME,
): number {
  const raw = store.getItem(highScoreKey(identity, productName));
  if (raw === null) return NO_HIGH_SCORE;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return NO_HIGH_SCORE;

  return parsed;
}

export interface HighScoreWrite {
  /** True if this run beat the stored value (or there was none). */
  readonly written: boolean;
  /** The value now stored. */
  readonly best: number;
  /** The value that was stored before, for a "new record" flourish. */
  readonly previousBest: number;
}

/**
 * Store `elapsedSeconds` only if it is strictly faster than the record.
 *
 * `write = only if best < 0 || elapsed < best` — an equal time does NOT overwrite,
 * matching Unity.
 */
export function writeHighScoreIfFaster(
  store: KeyValueStore,
  elapsedSeconds: number,
  identity: ArtworkIdentity = {},
  productName = PRODUCT_NAME,
): HighScoreWrite {
  const previousBest = readHighScore(store, identity, productName);

  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    return { written: false, best: previousBest, previousBest };
  }

  const isFirstRecord = previousBest < 0;
  if (!isFirstRecord && elapsedSeconds >= previousBest) {
    return { written: false, best: previousBest, previousBest };
  }

  store.setItem(highScoreKey(identity, productName), String(elapsedSeconds));
  return { written: true, best: elapsedSeconds, previousBest };
}

/** `mm:ss`, or `--:--` when there is no record. */
export function formatHighScore(seconds: number): string {
  return formatTime(seconds);
}

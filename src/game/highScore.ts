/**
 * GLOBAL high score — one best time for the whole game.
 *
 *   {productName}_HighScoreKey
 *
 * **This deliberately diverges from Unity** (client decision, 2026-07-31).
 * `GameManager.GetHighScoreKey()` builds
 * `{productName}_HighScoreKey_{artworkTitle | textureName | "Default"}`, making
 * the record per artwork. The client considers that wrong: the kiosk runs one
 * fixed 3x3 difficulty, so every run is comparable and there should be a single
 * board to beat. Unity's own comment above that method already claims the score
 * is app-wide — the code contradicts it.
 *
 * Two consequences of the per-artwork key that the global key removes: a visitor
 * could never beat a record set on a different picture, and because untitled
 * sources fall back to a fixed texture name, every QR upload silently shared one
 * bucket while every titled artwork got its own.
 *
 * **No migration.** Existing per-artwork records are left where they are, so the
 * badge reads `--:--` on the first run after this change and then rebuilds. The
 * old keys are unreachable, not deleted; `KeyValueStore` cannot enumerate keys,
 * so folding them into a single minimum would need a wider storage interface.
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

export function highScoreKey(productName = PRODUCT_NAME): string {
  return `${productName}_HighScoreKey`;
}

/**
 * Read the stored best time in seconds.
 *
 * @returns seconds, or `NO_HIGH_SCORE` (-1) when unset or unparseable. A corrupt
 * value is treated as "no record" rather than throwing — a kiosk must not fail to
 * start because one localStorage entry got mangled.
 */
export function readHighScore(store: KeyValueStore, productName = PRODUCT_NAME): number {
  const raw = store.getItem(highScoreKey(productName));
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
  productName = PRODUCT_NAME,
): HighScoreWrite {
  const previousBest = readHighScore(store, productName);

  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    return { written: false, best: previousBest, previousBest };
  }

  const isFirstRecord = previousBest < 0;
  if (!isFirstRecord && elapsedSeconds >= previousBest) {
    return { written: false, best: previousBest, previousBest };
  }

  store.setItem(highScoreKey(productName), String(elapsedSeconds));
  return { written: true, best: elapsedSeconds, previousBest };
}

/** `mm:ss`, or `--:--` when there is no record. */
export function formatHighScore(seconds: number): string {
  return formatTime(seconds);
}

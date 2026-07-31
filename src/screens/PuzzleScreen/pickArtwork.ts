import { hasImage, type ResultsData } from '../../api/types';

/**
 * Choose which collection record becomes the next puzzle.
 *
 * Split out of `loadArtwork.ts` and kept free of Tauri and DOM imports so the
 * selection rules — which are the whole reason "Play Again" stopped repeating —
 * can be unit-tested with a rigged RNG instead of inferred from a live run.
 *
 * Three rules, in order:
 *
 * 1. **Playable only.** No `primary_image`, no puzzle (game-logic §8.6).
 * 2. **Prefer titled records**, so the name above the board is not blank. Relaxed
 *    if a whole page is untitled — a picture with no name beats no picture.
 * 3. **Avoid what was played recently**, so "Play Again" cannot hand back the
 *    piece just finished.
 *
 * Rule 3 relaxes PROGRESSIVELY, and the order matters. `recent` is ordered
 * most-recent first, and the window shrinks from the back: forget the oldest
 * entries before the newest ones, so the id given up LAST is the artwork the
 * visitor just played. An earlier version used one flat set and dropped it whole
 * when it emptied the pool — which, on a small pool, meant the very artwork just
 * finished became eligible again. That reproduced the client's report exactly: a
 * 2-record pool showed consecutive repeats.
 *
 * The only case that still repeats immediately is a pool of exactly one playable
 * record, where there is nothing else to serve. Every relaxation is a deliberate
 * fallback — the kiosk must always end up with an artwork
 * (project-overview.md non-negotiable 4).
 */
export function pickArtwork(
  items: readonly ResultsData[],
  rng: () => number = Math.random,
  recent: readonly number[] = [],
): ResultsData | null {
  const playable = items.filter(hasImage);
  if (playable.length === 0) return null;

  const titled = playable.filter((item) => (item.title ?? '').trim().length > 0);
  const preferred = titled.length > 0 ? titled : playable;

  // `Math.min` guards an rng that returns exactly 1.
  const choose = (pool: readonly ResultsData[]) =>
    pool[Math.min(Math.floor(rng() * pool.length), pool.length - 1)] ?? pool[0] ?? null;

  // Widest exclusion first; `keep === 0` is the last resort and excludes nothing.
  for (let keep = recent.length; keep > 0; keep -= 1) {
    const exclude = new Set(recent.slice(0, keep));
    const fresh = preferred.filter((item) => !exclude.has(item.id));
    if (fresh.length > 0) return choose(fresh);
  }

  return choose(preferred);
}

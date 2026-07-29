import type { KeyValueStore } from '../game';

/**
 * `KeyValueStore` backed by `localStorage`, with an in-memory fallback.
 *
 * A kiosk must never fail to start because storage is unavailable or full — the
 * worst acceptable outcome is losing high scores for that session. Phase 6 swaps
 * this for the Tauri store plugin so records survive a WebView2 data reset; the
 * key shape stays identical either way (docs/game-logic.md §7).
 */

function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

function isUsable(): boolean {
  try {
    const probe = '__map_puzzle_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function createLocalStore(): KeyValueStore {
  if (!isUsable()) {
    console.warn('[storage] localStorage unavailable; high scores will not persist');
    return createMemoryStore();
  }

  return {
    getItem: (key) => {
      try {
        return window.localStorage.getItem(key);
      } catch (error) {
        console.warn('[storage] read failed', error);
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        window.localStorage.setItem(key, value);
      } catch (error) {
        // Quota or a locked profile. Losing one score beats crashing the kiosk.
        console.warn('[storage] write failed', error);
      }
    },
  };
}

export const highScoreStore: KeyValueStore = createLocalStore();

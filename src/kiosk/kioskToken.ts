/**
 * Per-machine kiosk identity.
 *
 * The server routes an uploaded photo to exactly the kiosk whose QR code was
 * scanned (no broadcast fallback — see the ticket this implements). That routing
 * is keyed on this token, so:
 *
 *   * it must be unique PER SCREEN — two kiosks sharing a token both light up,
 *     which is the bug being fixed;
 *   * it must survive a webview cache wipe or WebView2 update, which is why it is
 *     persisted through Tauri (`getKioskToken`'s real store), never
 *     `localStorage` — a kiosk that silently gets a new token stops matching the
 *     QR it is already displaying;
 *   * it must NOT be derived from a hardware id (MAC, machine GUID). The QR is
 *     public and photographable, so a hardware-derived token is a permanent
 *     fingerprint that can never be rotated if it leaks.
 */

/** `^[A-Za-z0-9_-]{8,64}$` — the shape the upload server requires. */
export const KIOSK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** 32 hex characters — a v4 UUID with the dashes stripped. */
export function generateKioskToken(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/** The minimal async key-value shape `resolveKioskToken` needs. Matches
 *  `@tauri-apps/plugin-store`'s `LazyStore` (a subset of it), so the real store
 *  can be passed straight in without an adapter. */
export interface TokenStore {
  get(key: string): Promise<string | undefined | null>;
  set(key: string, value: string): Promise<void>;
  save(): Promise<void>;
}

const STORE_KEY = 'kioskToken';

/**
 * Read the persisted token, or generate and persist one if there is none, or if
 * what's there no longer matches `KIOSK_TOKEN_PATTERN` (a hand-edited or
 * corrupted store file must not wedge the kiosk with an unusable token forever).
 *
 * Exported separately from `getKioskToken` so it is unit-testable against a fake
 * `TokenStore` without touching Tauri — same pattern as `game/highScore.ts`'s
 * injected `KeyValueStore`.
 */
export async function resolveKioskToken(store: TokenStore): Promise<string> {
  const existing = await store.get(STORE_KEY);
  if (typeof existing === 'string' && KIOSK_TOKEN_PATTERN.test(existing)) {
    return existing;
  }

  const token = generateKioskToken();
  await store.set(STORE_KEY, token);
  await store.save();
  return token;
}

/**
 * The real store: `@tauri-apps/plugin-store`'s `LazyStore` when running under
 * Tauri, or an in-memory fallback in plain-browser dev (`npm run dev`), which has
 * no Tauri IPC backend to talk to. `LazyStore` is imported dynamically so a
 * browser-only dev session never has to load a module whose calls would fail
 * outside a webview — same reasoning as `client.ts`'s `isTauri()` gate.
 */
async function createStore(): Promise<TokenStore> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { LazyStore } = await import('@tauri-apps/plugin-store');
    return new LazyStore('kiosk.json');
  }

  console.info('[kiosk] no Tauri store backend; using a session-only dev token');
  const memory = new Map<string, string>();
  return {
    get: async (key) => memory.get(key),
    set: async (key, value) => {
      memory.set(key, value);
    },
    save: async () => {},
  };
}

let cached: Promise<string> | null = null;

/** Memoised for the life of the process — every caller gets the same token. */
export function getKioskToken(): Promise<string> {
  cached ??= createStore().then(resolveKioskToken);
  return cached;
}

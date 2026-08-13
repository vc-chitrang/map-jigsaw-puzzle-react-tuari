# Per-Kiosk Upload Token Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every kiosk a unique, machine-persistent token; encode it in the QR code the visitor scans; and subscribe to that token's socket room on every connect (including reconnects) so an upload reaches only the kiosk whose QR was scanned.

**Architecture:** A Tauri-store-backed token (`src/kiosk/kioskToken.ts`), generated once and persisted outside the webview so a cache wipe can't desync it from the QR on screen. The token flows two places: into the QR payload (`?k=<token>`, rendered client-side — this app never had real QR generation, only a static bundled sprite, see Task 5) and into a `subscribe` emit fired inside the socket's `connect` handler, which is what survives a reconnect (Socket.IO does not restore room membership automatically).

**Tech Stack:** `@tauri-apps/plugin-store` (new — token persistence outside `localStorage`), `qrcode` (new — this repo has never generated a QR client-side; `docs/decisions.md` ADR-026 only ever describes a static PNG), `socket.io-client` v4.8.3 (already installed, `src/api/socket.ts`), Rust `tauri-plugin-store`.

## Global Constraints

- Token must match `^[A-Za-z0-9_-]{8,64}$`.
- Every screen needs a **different** token — two screens sharing one reproduces the bug being fixed.
- Token persists via the Tauri side (store plugin or `appConfigDir` file), **never** `localStorage` — a webview cache wipe or WebView2 update must not silently rotate it.
- Token must **not** be derived from a hardware id (MAC, machine GUID) — the QR is publicly photographable, so a hardware-derived token can never be rotated.
- QR must encode `${uploadBaseUrl}?k=${token}` — a URL missing a valid `?k=` gets an error page server-side, so a kiosk with no token configured must not show a QR claiming to work.
- `subscribe` must be emitted inside the socket's `connect` handler (fires on first connect **and** every reconnect) — not once at startup.
- Exactly one socket per app instance under React `StrictMode` (existing `App.tsx` effect already double-invoke-safe; preserve that).
- **Breaking change** — the acceptance criteria include verifying uploads stop working for a kiosk with no token, so this must ship as one unit, not partially.

**Repo-specific reality check (differs from how the spec describes "today"):**
- The QR is **not** currently a live-generated code. `docs/ui/scene-portrait.md`, `docs/decisions.md` (ADR-026) and `src/layout/crop.ts` all confirm it is a single static bundled sprite (`/assets/qr/qr-code.png`) — the exact same image in every kiosk, matching the Unity build byte-for-byte. There is no existing "QR encodes `https://<host>/<upload-path>`" behaviour to modify — Task 5/6 below **add** QR generation, they don't edit existing generation logic.
- There is no existing upload-URL config anywhere (`src-tauri/src/config.rs`, `.env.example`) — only `MAP_SOCKET_URL` exists. Task 4 adds `MAP_UPLOAD_URL` from scratch.
- `@tauri-apps/plugin-store` is not installed (checked `package.json` and `src-tauri/Cargo.toml`). Task 1 adds it. (`src/storage/localStore.ts`'s header comment already flags this as planned — "Phase 6 swaps this for the Tauri store plugin" — this plan does that swap for the kiosk token only; migrating the high-score store is out of scope here.)
- The existing socket module (`src/api/socket.ts`) has no room/subscribe concept at all today — it just listens for a broadcast `new-upload`. Task 7 adds the subscribe handshake from nothing, it doesn't fix a broken existing one.
- The CSP in `src-tauri/tauri.conf.json` already allows what's needed: `img-src` includes `data:` (QR data-URLs render fine) and `connect-src` includes `https:` and `wss:` (the socket already connects under this CSP). **No CSP change needed** — verify, don't guess.
- Existing `transports: ['polling']` on the socket (matching the Unity client, deliberately chosen per the comment in `socket.ts` for museum-network compatibility) is **preserved**, not changed to `['websocket', 'polling']` as the spec's example snippet shows — that's an unrelated, riskier change this plan does not make.

---

## Task 1: Add the Tauri store plugin

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

**Interfaces:**
- Produces: `@tauri-apps/plugin-store`'s `LazyStore` importable from the frontend; the Rust side registers the plugin so IPC calls succeed instead of erroring "plugin not found".

- [ ] **Step 1: Install the npm package**

Run:
```bash
npm install @tauri-apps/plugin-store
```

- [ ] **Step 2: Add the Rust crate**

In `src-tauri/Cargo.toml`, next to the existing `tauri-plugin-log = "2"` line (around line 21), add:

```toml
tauri-plugin-store = "2"
```

- [ ] **Step 3: Register the plugin in `lib.rs`**

In `src-tauri/src/lib.rs`, the builder chain currently starts:

```rust
tauri::Builder::default()
    .plugin(
        tauri_plugin_log::Builder::new()
            .level(log::LevelFilter::Info)
            .build(),
    )
```

Add the store plugin alongside it:

```rust
tauri::Builder::default()
    .plugin(
        tauri_plugin_log::Builder::new()
            .level(log::LevelFilter::Info)
            .build(),
    )
    .plugin(tauri_plugin_store::Builder::new().build())
```

- [ ] **Step 4: Grant the capability**

The kiosk's capability set (`src-tauri/capabilities/default.json`) is deliberately minimal — its own description says "Filesystem, shell and process access stay unavailable so a compromised web view cannot reach the host." The store plugin writes one small JSON file under `appConfigDir`, sandboxed by Tauri's own scoping, which fits that posture. Add `"store:default"` to the `permissions` array:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Kiosk capability set. Deliberately minimal — the renderer gets window control (for the staff exit hatch) and nothing else. Filesystem, shell and process access stay unavailable so a compromised web view cannot reach the host.",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-close",
    "core:window:allow-set-fullscreen",
    "core:window:allow-is-fullscreen",
    "log:default",
    "store:default"
  ]
}
```

- [ ] **Step 5: Verify it builds**

Run:
```bash
cd src-tauri && cargo check
```
Expected: no errors. (Full `cargo build` also works but `cargo check` is faster and sufficient here — there's no existing Rust test suite in this crate to run.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "build: add the Tauri store plugin for kiosk-token persistence"
```

---

## Task 2: Kiosk token module — generate, validate, persist

**Files:**
- Create: `src/kiosk/kioskToken.ts`
- Test: `src/kiosk/kioskToken.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `KIOSK_TOKEN_PATTERN: RegExp`, `generateKioskToken(): string`, `TokenStore` interface (`get`, `set`, `save`, all returning `Promise`), `resolveKioskToken(store: TokenStore): Promise<string>` (the pure, injectable logic — this is what Task 2's tests exercise), and `getKioskToken(): Promise<string>` (the real entry point, memoises and picks the Tauri-backed store when available). Task 3 and Task 8 both call `getKioskToken()`.

This mirrors the existing `KeyValueStore` injection pattern in `src/storage/localStore.ts` / `src/game/highScore.ts` — the pure logic is unit-tested against a fake store; the real Tauri-backed store is wired at the edge and is not itself unit-tested (same as `client.ts`'s `isTauri()`-gated calls).

- [ ] **Step 1: Write the failing tests**

Create `src/kiosk/kioskToken.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { KIOSK_TOKEN_PATTERN, generateKioskToken, resolveKioskToken, type TokenStore } from './kioskToken';

function createFakeStore(initial?: string): TokenStore {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set('kioskToken', initial);
  return {
    get: async (key) => map.get(key),
    set: async (key, value) => {
      map.set(key, value);
    },
    save: async () => {},
  };
}

describe('KIOSK_TOKEN_PATTERN', () => {
  it('accepts 8-64 chars of letters, digits, underscore, hyphen', () => {
    expect(KIOSK_TOKEN_PATTERN.test('a'.repeat(8))).toBe(true);
    expect(KIOSK_TOKEN_PATTERN.test('a'.repeat(64))).toBe(true);
    expect(KIOSK_TOKEN_PATTERN.test('Ab3_-Ab3_-Ab3_-')).toBe(true);
  });

  it('rejects anything shorter than 8 or longer than 64', () => {
    expect(KIOSK_TOKEN_PATTERN.test('a'.repeat(7))).toBe(false);
    expect(KIOSK_TOKEN_PATTERN.test('a'.repeat(65))).toBe(false);
  });

  it('rejects characters outside the allowed set', () => {
    expect(KIOSK_TOKEN_PATTERN.test('abcdefg!')).toBe(false);
    expect(KIOSK_TOKEN_PATTERN.test('abcdefg ')).toBe(false);
    expect(KIOSK_TOKEN_PATTERN.test('abcdef/g')).toBe(false);
  });
});

describe('generateKioskToken', () => {
  it('produces a token that matches the pattern', () => {
    expect(KIOSK_TOKEN_PATTERN.test(generateKioskToken())).toBe(true);
  });

  it('is 32 hex characters (a UUID with the dashes stripped)', () => {
    const token = generateKioskToken();
    expect(token).toHaveLength(32);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is different on every call', () => {
    const seen = new Set(Array.from({ length: 20 }, () => generateKioskToken()));
    expect(seen.size).toBe(20);
  });
});

describe('resolveKioskToken', () => {
  it('generates and persists a token when the store is empty', async () => {
    const store = createFakeStore();
    const token = await resolveKioskToken(store);
    expect(KIOSK_TOKEN_PATTERN.test(token)).toBe(true);
    await expect(store.get('kioskToken')).resolves.toBe(token);
  });

  it('reuses an existing valid token instead of generating a new one', async () => {
    const store = createFakeStore('existing-token-123');
    await expect(resolveKioskToken(store)).resolves.toBe('existing-token-123');
  });

  it('replaces a stored value that no longer matches the pattern', async () => {
    // Guards a corrupted or hand-edited store file from wedging the kiosk with an
    // unusable token forever.
    const store = createFakeStore('bad token!');
    const token = await resolveKioskToken(store);
    expect(token).not.toBe('bad token!');
    expect(KIOSK_TOKEN_PATTERN.test(token)).toBe(true);
  });

  it('replaces an empty stored value', async () => {
    const store = createFakeStore('');
    const token = await resolveKioskToken(store);
    expect(KIOSK_TOKEN_PATTERN.test(token)).toBe(true);
  });

  it('calls save() so the write is flushed', async () => {
    const store = createFakeStore();
    let saved = false;
    store.save = async () => {
      saved = true;
    };
    await resolveKioskToken(store);
    expect(saved).toBe(true);
  });

  it('does not call save() when reusing an existing token', async () => {
    const store = createFakeStore('existing-token-123');
    let saveCalls = 0;
    store.save = async () => {
      saveCalls += 1;
    };
    await resolveKioskToken(store);
    expect(saveCalls).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/kiosk/kioskToken.test.ts`
Expected: FAIL — `Cannot find module './kioskToken'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/kiosk/kioskToken.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/kiosk/kioskToken.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/kiosk/kioskToken.ts src/kiosk/kioskToken.test.ts
git commit -m "feat(kiosk): add the per-machine kiosk token, persisted via Tauri store"
```

---

## Task 3: Surface the token in the UI

**Files:**
- Create: `src/kiosk/useKioskToken.ts`
- Create: `src/ui/KioskTokenBadge.tsx`
- Create: `src/ui/KioskTokenBadge.module.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `getKioskToken()` from Task 2.
- Produces: `useKioskToken(): string | null` (also consumed by Task 8's socket wiring — one hook call in `App.tsx`, passed down, so the token is fetched exactly once per app instance).

- [ ] **Step 1: Write the hook**

Create `src/kiosk/useKioskToken.ts`:

```ts
import { useEffect, useState } from 'react';
import { getKioskToken } from './kioskToken';

/** `null` until the (memoised, one-time) token resolution finishes. */
export function useKioskToken(): string | null {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    void getKioskToken().then((value) => {
      if (!disposed) setToken(value);
    });
    return () => {
      disposed = true;
    };
  }, []);

  return token;
}
```

There's no test file for this — it's a thin `useEffect` wrapper over an already-tested function, the same tier as `useCollection.ts`'s non-fetch plumbing. `resolveKioskToken` (Task 2) carries the real logic under test.

- [ ] **Step 2: Write the badge component**

Create `src/ui/KioskTokenBadge.module.css` (mirrors `VersionBadge.module.css`, opposite corner so the two never overlap):

```css
/*
 * Viewport-fixed, so these are DEVICE px — not reference px. Outside the scaled
 * canvas on purpose, same reasoning as VersionBadge.
 */
.badge {
  position: fixed;
  right: 12px;
  bottom: 10px;
  z-index: 1000;

  font-family: var(--font-display);
  font-weight: 400;
  font-size: 16px;
  line-height: 1;
  letter-spacing: 0.02em;

  color: rgb(255 255 255 / 0.45);

  pointer-events: none;
  user-select: none;
}
```

Create `src/ui/KioskTokenBadge.tsx`:

```tsx
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
  if (import.meta.env.VITE_HIDE_VERSION === '1') return null;

  const token = useKioskToken();
  if (!token) return null;

  return (
    <span className={styles.badge} aria-hidden="true">
      kiosk: {token}
    </span>
  );
}
```

- [ ] **Step 3: Wire it into `App.tsx`**

`App.tsx` currently renders, near the end of its JSX:

```tsx
      <VersionBadge />
```

Add the import near the other top-of-file imports:

```tsx
import { KioskTokenBadge } from './ui/KioskTokenBadge';
```

and render it alongside `VersionBadge`:

```tsx
      <VersionBadge />
      <KioskTokenBadge />
```

(Task 8 adds `useKioskToken()` inside `App` itself, for the socket wiring — that call is independent of this badge; `useKioskToken`'s internal `getKioskToken()` is memoised, so two call sites cost one real token resolution, not two.)

- [ ] **Step 4: Manual verification**

Run the dev server (`npm run dev`) and open the app in a browser. Expected: a small, semi-transparent `kiosk: <32-hex-chars>` label in the bottom-right corner, distinct from the version badge in the bottom-left. Reload the page — the token must be the **same** value (the dev in-memory store only survives within one `getKioskToken()` memoisation, but the point to verify here is that the badge renders and is stable across a re-render, not across a full reload — the reload-survives-cache-wipe guarantee is Tauri-only and is exercised on real hardware, not in browser dev).

- [ ] **Step 5: Commit**

```bash
git add src/kiosk/useKioskToken.ts src/ui/KioskTokenBadge.tsx src/ui/KioskTokenBadge.module.css src/App.tsx
git commit -m "feat(kiosk): show the kiosk token in a debug corner for support"
```

---

## Task 4: Upload-URL config, end to end

**Files:**
- Modify: `src-tauri/src/config.rs`
- Modify: `src-tauri/src/api.rs`
- Modify: `src-tauri/.env.example`
- Modify: `src/api/client.ts`
- Modify: `src/api/types.ts` (only if `PublicConfig` lives there — verify; as read, it's defined in `client.ts`)

**Interfaces:**
- Produces: `getPublicConfig()` resolves to `{ socketUrl, collectionAvailable, uploadUrl }`, where `uploadUrl` is `''` when unconfigured. Task 5/6/8 consume `uploadUrl`.

- [ ] **Step 1: Add the Rust config field**

In `src-tauri/src/config.rs`, add `upload_url` to `ApiConfig`:

```rust
#[derive(Debug, Clone)]
pub struct ApiConfig {
    pub base_url: String,
    pub key: String,
    pub collection_path: String,
    pub login_path: String,
    pub socket_url: String,
    /// Full URL the QR code encodes (before the `?k=` token is appended). Empty
    /// when unconfigured — there is no safe default, unlike `socket_url`, because
    /// the path segment is a deliberately obfuscated, server-assigned value (see
    /// the doc comment in `.env.example`).
    pub upload_url: String,
    pub oauth: OAuthCredentials,
}
```

In `load()`, add the field (no default — empty means "not configured", mirroring how `base_url`/`key` already work):

```rust
        socket_url: {
            let url = var("MAP_SOCKET_URL", option_env!("MAP_SOCKET_URL"));
            if url.is_empty() {
                "https://i-am-puzzle.map-india.org".to_string()
            } else {
                url
            }
        },
        upload_url: var("MAP_UPLOAD_URL", option_env!("MAP_UPLOAD_URL")),
```

(Insert this right after the `socket_url` block, before `oauth: OAuthCredentials { ... }`.)

Add a log line next to the existing `describe(...)` block so a misconfiguration is visible at startup, same as the collection API's:

```rust
    log::info!(
        "API config: base_url {}, key {}, client_id {}, client_secret {}, collection_path {}, grant {}, upload_url {}",
        describe(&config.base_url),
        describe(&config.key),
        describe(&config.oauth.client_id),
        describe(&config.oauth.client_secret),
        config.collection_path,
        config.oauth.grant_type,
        describe(&config.upload_url),
    );
```

- [ ] **Step 2: Expose it through `public_config`**

In `src-tauri/src/api.rs`, find the `PublicConfig` struct (around line 439) and the `public_config` command (around line 446):

```rust
#[derive(serde::Serialize)]
pub struct PublicConfig {
    pub socket_url: String,
    pub collection_available: bool,
    pub upload_url: String,
}

#[tauri::command]
pub fn public_config() -> PublicConfig {
    let config = config::get();
    PublicConfig {
        socket_url: config.socket_url.clone(),
        collection_available: config.is_usable(),
        upload_url: config.upload_url.clone(),
    }
}
```

(Adjust to match the struct's actual current field list if `cargo check` in Step 4 shows a mismatch — the two fields shown above are confirmed present from the current file; add `upload_url` to both without removing anything else.)

- [ ] **Step 3: Document the new env var**

In `src-tauri/.env.example`, add it next to `MAP_SOCKET_URL`:

```bash
MAP_SOCKET_URL=https://i-am-puzzle.map-india.org
# Full URL the QR code encodes, before this kiosk's `?k=<token>` is appended.
# The path segment is a deliberately obfuscated value assigned by the upload
# server (its own UPLOAD_ROUTE_PATH) — there is no default, and no script can
# extract it from the Unity project the way the other values above are:
# this feature has no Unity-side equivalent. Get it from whoever owns the
# upload server's .env.
MAP_UPLOAD_URL=
```

- [ ] **Step 4: Verify the Rust side builds**

Run:
```bash
cd src-tauri && cargo check
```
Expected: no errors.

- [ ] **Step 5: Update the TypeScript side**

In `src/api/client.ts`, `PublicConfig` and `getPublicConfig()` currently read:

```ts
export interface PublicConfig {
  readonly socketUrl: string;
  readonly collectionAvailable: boolean;
}
```

and

```ts
  if (!isTauri()) {
    return Promise.resolve({ socketUrl: '', collectionAvailable: false });
  }

  publicConfigPromise ??= invoke<{ socket_url: string; collection_available: boolean }>(
    'public_config',
  )
    .then((raw) => ({
      socketUrl: raw.socket_url,
      collectionAvailable: raw.collection_available,
    }))
    .catch((error) => {
      console.error('[api] public_config failed', error);
      return { socketUrl: '', collectionAvailable: false };
    });
```

Change both to carry `uploadUrl`:

```ts
export interface PublicConfig {
  readonly socketUrl: string;
  readonly collectionAvailable: boolean;
  /** Empty when the upload feature is not configured server-side. */
  readonly uploadUrl: string;
}
```

```ts
  if (!isTauri()) {
    return Promise.resolve({ socketUrl: '', collectionAvailable: false, uploadUrl: '' });
  }

  publicConfigPromise ??= invoke<{
    socket_url: string;
    collection_available: boolean;
    upload_url: string;
  }>('public_config')
    .then((raw) => ({
      socketUrl: raw.socket_url,
      collectionAvailable: raw.collection_available,
      uploadUrl: raw.upload_url,
    }))
    .catch((error) => {
      console.error('[api] public_config failed', error);
      return { socketUrl: '', collectionAvailable: false, uploadUrl: '' };
    });
```

- [ ] **Step 6: Verify the TS side type-checks**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors. (This will also catch any other callers of `PublicConfig`/`getPublicConfig` that destructure it positionally rather than by field — there shouldn't be any, `connectUploadSocket` in `src/api/socket.ts` uses `config.socketUrl` by name.)

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/config.rs src-tauri/src/api.rs src-tauri/.env.example src/api/client.ts
git commit -m "feat(config): add MAP_UPLOAD_URL, the base URL the kiosk QR encodes"
```

---

## Task 5: QR URL + image generation

**Files:**
- Create: `src/api/qr.ts`
- Test: `src/api/qr.test.ts`
- Modify: `package.json` (new dependency)

**Interfaces:**
- Consumes: nothing from earlier tasks directly (pure functions); Task 6 wires `uploadUrl` (Task 4) and the kiosk token (Task 2/3) through it.
- Produces: `buildUploadUrl(uploadBaseUrl: string, kioskToken: string): string`, `generateQrDataUrl(text: string): Promise<string>`.

This app has never generated a QR code client-side — Task 5 adds the capability from nothing (see the "repo-specific reality check" at the top of this plan).

- [ ] **Step 1: Install the QR library**

Run:
```bash
npm install qrcode
npm install -D @types/qrcode
```

- [ ] **Step 2: Write the failing test**

Create `src/api/qr.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildUploadUrl } from './qr';

describe('buildUploadUrl', () => {
  it('appends the token as a k query parameter', () => {
    expect(buildUploadUrl('https://host.example/abc123', 'tok123456')).toBe(
      'https://host.example/abc123?k=tok123456',
    );
  });

  it('percent-encodes characters in the token that need it', () => {
    // The token never actually contains a space (KIOSK_TOKEN_PATTERN forbids it),
    // but the encoding call is defensive, not conditional on that guarantee.
    expect(buildUploadUrl('https://host.example/abc123', 'a b')).toBe(
      'https://host.example/abc123?k=a%20b',
    );
  });

  it('does not alter the base URL', () => {
    const base = 'https://host.example/some/obfuscated-path';
    expect(buildUploadUrl(base, 'tok')).toBe(`${base}?k=tok`);
  });
});
```

(`generateQrDataUrl` is not unit-tested here — it is a thin wrapper over the `qrcode` library's own `toDataURL`, which is the library's concern to get right, not this app's. Task 6's manual verification step exercises it visually.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/api/qr.test.ts`
Expected: FAIL — `Cannot find module './qr'`.

- [ ] **Step 4: Write the implementation**

Create `src/api/qr.ts`:

```ts
import QRCode from 'qrcode';

/**
 * Build the URL this kiosk's QR code encodes.
 *
 * `uploadBaseUrl` is `https://<host>/<obfuscated-upload-path>` (from
 * `getPublicConfig().uploadUrl`, Task 4) and carries no query string of its own,
 * so a plain append is correct — no need for a full `URL` round-trip that could
 * reformat the base unexpectedly.
 */
export function buildUploadUrl(uploadBaseUrl: string, kioskToken: string): string {
  return `${uploadBaseUrl}?k=${encodeURIComponent(kioskToken)}`;
}

/**
 * Render `text` as a QR code, returned as a `data:image/png` URL.
 *
 * `data:` URLs are already permitted by the CSP's `img-src` (`tauri.conf.json`
 * already lists `data:` there for other reasons), so this needs no CSP change.
 *
 * White light / black dark, no margin beyond the library's own quiet-zone
 * default, matching the plain-white-square design the static sprite used
 * (`docs/decisions.md` ADR-026): "the QR sprite is black-on-transparent, so it
 * sits on its own plain white square". `.qrCode`'s CSS already supplies that
 * white background and the rounded corner — this just needs to produce a clean
 * black-on-white code to sit on top of it.
 */
export function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 1024,
    margin: 1,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/api/qr.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/api/qr.ts src/api/qr.test.ts
git commit -m "feat(qr): add live QR generation (this app only ever had a static sprite)"
```

---

## Task 6: Render the real QR on the ImageSelect screen

**Files:**
- Modify: `src/screens/ImageSelectScreen/ImageSelectScreen.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `buildUploadUrl`, `generateQrDataUrl` (Task 5); `useKioskToken()` (Task 3); `getPublicConfig()` (Task 4).
- Produces: the `qrPanel.codeSprite` static asset stops being used by this screen (the file stays on disk — deleting bundled assets is out of scope here).

- [ ] **Step 1: Add props to `ImageSelectScreen`**

In `src/screens/ImageSelectScreen/ImageSelectScreen.tsx`, the props interface currently is:

```tsx
interface ImageSelectScreenProps {
  readonly onBack: () => void;
  readonly onBrowseCollection: () => void;
  /**
   * Accepted for call-site compatibility but no longer used: the QR is always
   * shown clean, with no offline/dimmed state (per design correction).
   */
  readonly uploadReady?: boolean;
}
```

Add two fields (leave `uploadReady` exactly as-is — it's unrelated, pre-existing dead-by-design code, not this task's concern):

```tsx
interface ImageSelectScreenProps {
  readonly onBack: () => void;
  readonly onBrowseCollection: () => void;
  /**
   * Accepted for call-site compatibility but no longer used: the QR is always
   * shown clean, with no offline/dimmed state (per design correction).
   */
  readonly uploadReady?: boolean;
  /** `null` until resolved; the QR does not render until this is available. */
  readonly kioskToken: string | null;
  /** From `getPublicConfig().uploadUrl`. Empty when the upload feature is not
   *  configured server-side — the QR does not render in that case either. */
  readonly uploadBaseUrl: string;
}
```

- [ ] **Step 2: Generate the QR inside the component**

Add the imports at the top of the file:

```tsx
import { useEffect, useState } from 'react';
import { buildUploadUrl, generateQrDataUrl } from '../../api/qr';
```

Inside the component function, before the `return`, add:

```tsx
export function ImageSelectScreen({
  onBack,
  onBrowseCollection,
  kioskToken,
  uploadBaseUrl,
}: ImageSelectScreenProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!kioskToken || !uploadBaseUrl) {
      setQrDataUrl(null);
      return;
    }

    let disposed = false;
    const url = buildUploadUrl(uploadBaseUrl, kioskToken);
    void generateQrDataUrl(url)
      .then((dataUrl) => {
        if (!disposed) setQrDataUrl(dataUrl);
      })
      .catch((error) => {
        console.error('[image-select] could not generate the upload QR', error);
      });

    return () => {
      disposed = true;
    };
  }, [kioskToken, uploadBaseUrl]);

  const description = (
```

(The existing `const description = (...)` line right after is unchanged — this just inserts the hook logic above it. Keep everything else in the function body as it is.)

- [ ] **Step 3: Swap the static sprite for the generated one**

The QR `<img>` currently reads:

```tsx
        <div className={styles.qrPanel} style={rectStyle(S.qrPanel.rect)}>
          <img
            className={styles.qrCode}
            style={rectStyle(S.qrPanel.codeRect)}
            src={S.qrPanel.codeSprite}
            alt="QR code to upload your own image"
            draggable={false}
          />
```

Change the `src` to the generated data URL, and don't render the `<img>` at all until it's ready — `.qrCode`'s CSS already paints the white rounded square as its own background, so an unrendered `<img>` still looks like a clean blank square rather than a broken-image glyph:

```tsx
        <div className={styles.qrPanel} style={rectStyle(S.qrPanel.rect)}>
          {qrDataUrl ? (
            <img
              className={styles.qrCode}
              style={rectStyle(S.qrPanel.codeRect)}
              src={qrDataUrl}
              alt="QR code to upload your own image"
              draggable={false}
            />
          ) : (
            <div className={styles.qrCode} style={rectStyle(S.qrPanel.codeRect)} />
          )}
```

- [ ] **Step 4: Pass the new props from `App.tsx`**

`App.tsx` currently renders:

```tsx
    nav.current === 'select' ? (
      <ImageSelectScreen
        onBack={handleBack}
        onBrowseCollection={() => go('collection')}
        uploadReady={uploadReady}
      />
    )
```

Add a `uploadBaseUrl` state (fetched once, same tier as the existing `uploadReady` state) and the kiosk token (Task 8 also needs the token in this component — that task adds the `useKioskToken()` call itself; this step just adds the prop wiring assuming a `kioskToken` variable already exists in scope by the time both tasks are applied):

```tsx
  const [uploadBaseUrl, setUploadBaseUrl] = useState('');
```

(Add this near the other `useState` declarations at the top of `App`.) And a one-time fetch:

```tsx
  useEffect(() => {
    void getPublicConfig().then((config) => setUploadBaseUrl(config.uploadUrl));
  }, []);
```

(Add this as its own effect, near the QR-upload-socket effect — it's independent of it.) Import `getPublicConfig`:

```tsx
import { fetchImageAsBlobUrl, getPublicConfig } from './api/client';
```

(This adds `getPublicConfig` to the existing `fetchImageAsBlobUrl` import line.)

Then update the JSX:

```tsx
    nav.current === 'select' ? (
      <ImageSelectScreen
        onBack={handleBack}
        onBrowseCollection={() => go('collection')}
        uploadReady={uploadReady}
        kioskToken={kioskToken}
        uploadBaseUrl={uploadBaseUrl}
      />
    )
```

(`kioskToken` itself is introduced by Task 8 — if Task 6 is executed before Task 8, add `const kioskToken = useKioskToken();` and the corresponding import right now rather than leaving a dangling reference; if Task 8 already ran, this is already present and Task 6 just adds the two new JSX props.)

- [ ] **Step 5: Manual verification**

Run the dev server, open the ImageSelect screen (Puzzle → START → "Add from MAP's collection" leads to the collection screen, not this one — reach ImageSelect via any path that still routes there, or check `App.tsx`'s nav wiring for the current entry point into `'select'`). Expected: the QR square renders a real, scannable-looking QR pattern (not the old static sprite) once the kiosk token resolves; before that (briefly, on first mount) it's a blank white rounded square, not a broken-image icon.

Decode the rendered QR (any phone camera, or paste the data URL into a browser tab and read it back with a QR-reading site) and confirm it reads `<uploadBaseUrl>?k=<the same token the corner badge shows>`.

- [ ] **Step 6: Commit**

```bash
git add src/screens/ImageSelectScreen/ImageSelectScreen.tsx src/App.tsx
git commit -m "feat(upload): render a real per-kiosk QR instead of the static sprite"
```

---

## Task 7: Subscribe on every connect, not just the first

**Files:**
- Modify: `src/api/socket.ts`

**Interfaces:**
- Consumes: nothing new from earlier tasks (the token is passed in as a parameter by the caller — Task 8 is the caller).
- Produces: `connectUploadSocket(kioskToken: string, handlers: UploadSocketHandlers)` — signature change, one new required parameter before the existing `handlers` object.

**This is the critical part of the whole ticket.** Socket.IO does not restore room membership after a reconnect — subscribing only in a one-time setup path means a network blip makes the kiosk go silently deaf, with the server logging `event dropped` while the visitor still sees "upload successful". Putting the `emit('subscribe', ...)` inside the `connect` handler (not next to where the socket is created) is what covers this, because `connect` fires again on every reconnect.

- [ ] **Step 1: Update the module doc comment and handler signature**

In `src/api/socket.ts`, the module doc comment currently describes the old broadcast behaviour. Update it, and change the exported function's signature. Currently:

```ts
export async function connectUploadSocket(
  handlers: UploadSocketHandlers,
): Promise<UploadSocket | null> {
  const config = await getPublicConfig();
```

Change to:

```ts
export async function connectUploadSocket(
  kioskToken: string,
  handlers: UploadSocketHandlers,
): Promise<UploadSocket | null> {
  const config = await getPublicConfig();
```

- [ ] **Step 2: Emit `subscribe` inside the `connect` handler, and handle `subscribed`**

The `connect` handler currently reads:

```ts
  socket.on('connect', () => {
    console.info('[socket] connected');
    handlers.onStatus?.(true);
  });
```

Change to:

```ts
  socket.on('connect', () => {
    console.info('[socket] connected');
    handlers.onStatus?.(true);
    // Fires on first connect AND on every reconnect — Socket.IO does not restore
    // room membership across a reconnect, so re-subscribing here (not once at
    // setup) is what keeps this kiosk's uploads arriving after a network blip.
    socket.emit('subscribe', kioskToken);
  });

  socket.on('subscribed', (result: { status?: string; kiosk?: string; message?: string }) => {
    if (result?.status === 'ok') {
      console.info('[socket] subscribed to', result.kiosk ?? kioskToken);
    } else {
      console.error('[socket] subscribe rejected:', result?.message);
    }
  });
```

(Insert the `subscribed` listener as its own `socket.on(...)` call, anywhere among the other listener registrations — e.g. right after the block above, before the existing `disconnect`/`connect_error`/`new-upload` listeners.)

- [ ] **Step 3: Update the module doc comment**

The file's header comment currently says (among other things) that the socket delivers a broadcast the caller must gate by screen. Update the block to describe the subscribe handshake — replace the existing header comment's body with:

```ts
/**
 * QR phone upload — Socket.IO `new-upload`, routed per kiosk.
 *
 * Ports `SocketConnection` (docs/game-logic.md §9), extended with per-kiosk
 * routing: the server used to broadcast every upload to every connected kiosk;
 * it now delivers an upload only to the kiosk whose token (`src/kiosk/kioskToken.ts`)
 * matches the one encoded in the QR that was scanned (`src/api/qr.ts`). There is
 * deliberately no broadcast fallback — a kiosk that never subscribes receives
 * nothing.
 *
 *   URL   : https://i-am-puzzle.map-india.org  (from the Rust `public_config`)
 *   event : "new-upload" -> payload carrying an image URL and the routed `kiosk` token
 *
 * SUBSCRIBE ON EVERY CONNECT, NOT JUST THE FIRST. Socket.IO does not restore room
 * membership after a reconnect, so the `subscribe` emit lives inside the
 * `connect` handler (fires again on every reconnect) rather than next to socket
 * creation. Skipping this is the single most common way to reintroduce the bug
 * this module exists to fix: the kiosk looks connected, but a network blip
 * silently drops it out of its room and no more uploads arrive.
 *
 * `transports: ['polling']` matches the Unity client. WebSocket would be more
 * efficient, but the Unity build has been running against this server on polling,
 * and a museum network that permits polling may not permit an upgrade — matching
 * the shipped behaviour is the safer default.
 *
 * VISIBILITY GATE: `UIManager.OnImageReceived` accepts an upload ONLY while the
 * ImageSelect or Crop screen is showing. That lets a visitor scan a second QR
 * while already cropping and have the image replaced in place, and it stops an
 * upload from hijacking someone else's game in progress. The gate lives with the
 * caller, which knows the current screen; this module just delivers events.
 */
```

- [ ] **Step 4: Run the existing test file to confirm nothing broke**

Run: `npx vitest run src/api/socket.test.ts`
Expected: PASS — this file only tests `extractImageUrl`, which this task does not touch. (No new automated test is added for `connectUploadSocket` itself: it is a live-network integration point, same tier as `connectUploadSocket`'s pre-existing untested wiring — the acceptance criteria's "pull the network cable" check in Task 9 is the real verification for this behaviour, matching how this file has always been tested — pure logic gets a test, socket wiring is verified live.)

- [ ] **Step 5: Commit**

```bash
git add src/api/socket.ts
git commit -m "fix(socket): re-subscribe to the kiosk's room on every reconnect, not just once"
```

---

## Task 8: Wire the kiosk token into the socket connection

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useKioskToken()` (Task 3), the updated `connectUploadSocket(kioskToken, handlers)` (Task 7).

- [ ] **Step 1: Add the hook call**

Near the top of the `App` function, alongside the other `useState`/`useRef` declarations, add:

```tsx
  const kioskToken = useKioskToken();
```

Import it:

```tsx
import { useKioskToken } from './kiosk/useKioskToken';
```

(If Task 6 already added this line while wiring `ImageSelectScreen`'s props, skip the duplicate — this is the same single call, just noting where it's introduced if Task 8 runs first.)

- [ ] **Step 2: Gate the socket effect on the token, and pass it through**

The socket effect currently reads:

```tsx
  useEffect(() => {
    let socket: UploadSocket | null = null;
    let disposed = false;

    void (async () => {
      const connection = await connectUploadSocket({
        onStatus: setUploadReady,
        onImageUrl: (url) => {
          const current = screenRef.current;
          if (current !== 'select' && current !== 'crop') {
            console.info(`[app] ignoring an upload while on the ${current} screen`);
            return;
          }
          void openCropWith(url, '');
        },
      });

      if (disposed) {
        connection?.disconnect();
        return;
      }
      socket = connection;
    })();

    return () => {
      disposed = true;
      socket?.disconnect();
    };
  }, [openCropWith]);
```

Change to gate on `kioskToken` and pass it as the new first argument:

```tsx
  useEffect(() => {
    // Nothing to subscribe with yet — the effect re-runs once the token resolves.
    if (!kioskToken) return;

    let socket: UploadSocket | null = null;
    let disposed = false;

    void (async () => {
      const connection = await connectUploadSocket(kioskToken, {
        onStatus: setUploadReady,
        onImageUrl: (url) => {
          const current = screenRef.current;
          if (current !== 'select' && current !== 'crop') {
            console.info(`[app] ignoring an upload while on the ${current} screen`);
            return;
          }
          void openCropWith(url, '');
        },
      });

      if (disposed) {
        connection?.disconnect();
        return;
      }
      socket = connection;
    })();

    return () => {
      disposed = true;
      socket?.disconnect();
    };
  }, [openCropWith, kioskToken]);
```

- [ ] **Step 3: Verify the app still boots**

Run: `npx tsc --noEmit`
Expected: no errors — confirms every call site of `connectUploadSocket` (there is exactly one, this one) was updated for the new signature.

Then run the dev server and confirm in the browser console: `[socket] connected` still logs (or `[socket] no socket URL configured...` in plain browser dev with no Tauri backend, which is the pre-existing, expected dev behaviour — `getPublicConfig()` returns an empty `socketUrl` outside Tauri).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): pass the kiosk token into the upload socket connection"
```

---

## Task 9: Full verification pass + docs

**Files:**
- Modify: `docs/decisions.md` (new ADR)
- Modify: `docs/tasks.md`
- Modify: `docs/ai_handoff.md`

Per this repo's `AGENTS.md`: "Update decisions.md for major decisions" (during coding) and "Update ai_handoff.md, record modified files, record next recommended task" (after coding). This is the required doc pass for everything Tasks 1-8 built. No code changes in this task.

- [ ] **Step 1: Add the ADR**

Append to `docs/decisions.md` (the next free number, confirmed by scanning the file, is ADR-053):

```markdown
## ADR-053 — Per-kiosk upload token (breaking change, no broadcast fallback)

**Date:** 2026-08-13 · **Status:** Accepted (required server-side change)

**Context.** The upload socket used to broadcast every `new-upload` to every
connected kiosk, so a photo scanned on one screen appeared on all of them. The
server was changed to route an upload only to the kiosk whose QR was scanned,
keyed on a "kiosk token" the kiosk itself generates, persists, and encodes in its
own QR code. There is deliberately no fallback to the old broadcast — a kiosk
that never implements the subscribe handshake receives nothing.

**Decision.** Generate a token once per machine (`crypto.randomUUID()` with the
dashes stripped, `src/kiosk/kioskToken.ts`), persist it via
`@tauri-apps/plugin-store` (never `localStorage` — a webview cache wipe must not
silently desync the token from the QR already on screen), encode it in the QR as
`?k=<token>` (`src/api/qr.ts` — this app had never generated a QR client-side
before this; it was always a static bundled sprite, see ADR-026), and emit
`subscribe` inside the socket's `connect` handler so a reconnect re-subscribes
automatically (`src/api/socket.ts` — Socket.IO does not restore room membership
across a reconnect on its own).

**Consequences.**
- Ships as one unit with the server deploy — there is no partial-rollout path,
  by design (no broadcast fallback).
- The token is visible in a small always-on debug corner (`KioskTokenBadge`,
  bottom-right, mirroring `VersionBadge`'s bottom-left) so support can read it
  off a live screen.
- `src/storage/localStore.ts`'s header comment already flagged the Tauri store
  plugin as planned for a future high-score migration; this ADR is the first
  actual use of that plugin, scoped to the kiosk token only. The high-score
  store itself is unchanged.
- Verified end to end (docs/tasks.md): two kiosks with different tokens only
  light up on their own scan; killing and restoring the network on one kiosk
  and uploading again still arrives, proving the reconnect re-subscribe works.
```

- [ ] **Step 2: Add the tasks.md entries**

Add a new section to `docs/tasks.md` (matching the file's existing table format — check a nearby section like "Phase 4 — Crop + QR upload" for the exact column headers before writing this) recording: token generation/persistence — DONE; QR now dynamic — DONE; subscribe-on-every-connect — DONE; end-to-end two-kiosk + network-blip verification — mark as the one item that needs REAL HARDWARE (two machines, or two browser sessions against the real upload server) rather than dev-only verification, same honesty pattern the rest of this file already uses for hardware-gated items (e.g. "P6.10... kiosk-hardware install").

- [ ] **Step 3: Update ai_handoff.md**

Add a new dated entry at the top of the "Most recent work" section (`docs/ai_handoff.md` §0) following the file's existing style — one paragraph stating what shipped (Tasks 1-8), the one ADR number (ADR-053), and explicitly flag under "Recommended next task": the two-kiosk / network-blip end-to-end check from the ticket's "How to verify" section still needs running against the real upload server (this cannot be verified from a single dev machine with no server access) before this ships.

- [ ] **Step 4: Commit**

```bash
git add docs/decisions.md docs/tasks.md docs/ai_handoff.md
git commit -m "docs: record ADR-053 and the per-kiosk upload token handoff"
```

---

## What this plan deliberately does NOT do

- Does not change `transports: ['polling']` to include `websocket`, even though the ticket's example snippet does — that transport choice is an existing, deliberately-documented decision for museum-network compatibility, unrelated to this ticket's actual requirement (the subscribe handshake).
- Does not add a CSP change — the existing `connect-src`/`img-src` already cover what's needed; verified by reading `tauri.conf.json`, not assumed.
- Does not touch `src/storage/localStore.ts` or the high-score persistence — out of scope, despite that file's comment flagging the store plugin as eventually relevant there too.
- Does not remove the dead `uploadReady` prop on `ImageSelectScreen` — pre-existing, unrelated to this ticket.
- Does not run the two-kiosk / kill-the-network end-to-end check (Task 9's acceptance-criteria item) as part of this plan's own verification — it requires the real upload server and two live kiosk sessions, which is out of reach from this dev environment. Flagged explicitly in `ai_handoff.md` as the next required step before shipping.

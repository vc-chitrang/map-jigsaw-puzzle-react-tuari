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

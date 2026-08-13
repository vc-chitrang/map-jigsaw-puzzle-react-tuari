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

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

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
 * White light / black dark, no margin override — the library's real default
 * (`margin: 4`, see `qrcode/lib/renderer/utils.js`) applies, giving a proper
 * quiet zone around the finder patterns. That matters here because `.qrCode`
 * has a `border-radius` (see `ImageSelectScreen.module.css`): too thin a quiet
 * zone risks the rounded corners clipping into the code and breaking phone
 * scans. This also matches the plain-white-square design the static sprite
 * used (`docs/decisions.md` ADR-026): "the QR sprite is black-on-transparent,
 * so it sits on its own plain white square". `.qrCode`'s CSS already supplies
 * that white background and the rounded corner — this just needs to produce a
 * clean black-on-white code to sit on top of it.
 */
export function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 1024,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
}

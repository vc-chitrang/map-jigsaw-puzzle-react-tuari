/**
 * Centre-crop an image to 1:1 — Unity's `CropToSquare`.
 *
 * `size = min(w, h)`, `offset = ((w − size) / 2, (h − size) / 2)`
 * (docs/game-logic.md §2.1).
 *
 * The board slices its artwork with `background-size: 300% 300%`, which assumes a
 * square source; a non-square image would stretch. Cropping once here is cheaper
 * than nine bitmap copies and keeps the tiles pure CSS.
 *
 * DOM module, so it lives outside `src/game/`.
 */

export interface SquareArtwork {
  /** Blob URL of the square bitmap. Revoke with `releaseArtwork`. */
  readonly url: string;
  /** Edge length of the crop, in source px. */
  readonly size: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Needed for canvas export once artwork comes from the collection CDN.
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`failed to load image: ${src}`));
    image.src = src;
  });
}

export async function cropToSquare(src: string): Promise<SquareArtwork> {
  const image = await loadImage(src);

  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width === 0 || height === 0) throw new Error(`image has no intrinsic size: ${src}`);

  const size = Math.min(width, height);

  // Already square — skip the copy entirely.
  if (width === height) return { url: src, size };

  const offsetX = Math.floor((width - size) / 2);
  const offsetY = Math.floor((height - size) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable');

  context.drawImage(image, offsetX, offsetY, size, size, 0, 0, size, size);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
  if (!blob) throw new Error('canvas.toBlob returned null');

  return { url: URL.createObjectURL(blob), size };
}

/** Release a blob URL produced by `cropToSquare`. No-op for pass-through URLs. */
export function releaseArtwork(artwork: SquareArtwork | null): void {
  if (artwork?.url.startsWith('blob:')) URL.revokeObjectURL(artwork.url);
}

/**
 * Bundled offline artwork, copied from the Unity `Textures` folder.
 *
 * Unity loads that folder at runtime and falls back to it when the collection API
 * is unavailable; the kiosk must stay playable offline
 * (docs/project-overview.md non-negotiable 4). Phase 3 puts the collection in
 * front of these.
 */
export const FALLBACK_ARTWORK = [
  '/assets/fallback/fallback-00.png',
  '/assets/fallback/fallback-01.png',
  '/assets/fallback/fallback-02.png',
] as const;

export function pickFallbackArtwork(rng: () => number = Math.random): string {
  const index = Math.min(Math.floor(rng() * FALLBACK_ARTWORK.length), FALLBACK_ARTWORK.length - 1);
  return FALLBACK_ARTWORK[index] ?? FALLBACK_ARTWORK[0];
}

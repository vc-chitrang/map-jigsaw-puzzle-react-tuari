/**
 * Export the cropped square. DOM module — uses `<canvas>`.
 */

import { gridToSourceRect, isQuarterTurn, type Rect, type Rotation } from './cropGrid';

export interface ExportedCrop {
  /** Blob URL of the square PNG. Revoke when finished with it. */
  readonly url: string;
  /** Edge length in source pixels. */
  readonly size: number;
}

/**
 * Draw a rotated image into a canvas, so the rest of the pipeline can treat it as
 * an ordinary axis-aligned bitmap.
 *
 * Rotation is committed to pixels here rather than carried as a transform: the
 * board slices the artwork with `background-position`, which cannot express a
 * rotation, and Unity likewise commits the pixel rotation after its 300 ms
 * visual tween.
 */
function drawRotated(image: HTMLImageElement, rotation: Rotation): HTMLCanvasElement {
  const swapped = isQuarterTurn(rotation);
  const width = swapped ? image.naturalHeight : image.naturalWidth;
  const height = swapped ? image.naturalWidth : image.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  // Rotate about the centre of the OUTPUT canvas, then draw the source centred.
  context.translate(width / 2, height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

  return canvas;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`failed to load image: ${src}`));
    image.src = src;
  });
}

/**
 * Produce the square crop the board will slice.
 *
 * `grid` and `visible` are in STAGE coordinates; this converts to source pixels,
 * so the export is at full source resolution rather than at display size — a
 * kiosk board is 1520 reference px and would look soft otherwise.
 */
export async function exportCrop(
  imageUrl: string,
  grid: Rect,
  visible: Rect,
  rotation: Rotation,
): Promise<ExportedCrop> {
  const image = await loadImage(imageUrl);

  const source = { width: image.naturalWidth, height: image.naturalHeight };
  if (source.width === 0 || source.height === 0) {
    throw new Error('image has no intrinsic size');
  }

  const rotated = drawRotated(image, rotation);
  const region = gridToSourceRect(grid, visible, source, rotation);

  // The board is square, and the grid is square, so this is one number.
  const size = Math.max(1, Math.round(Math.min(region.width, region.height)));

  const output = document.createElement('canvas');
  output.width = size;
  output.height = size;

  const context = output.getContext('2d');
  if (!context) throw new Error('2D canvas context unavailable');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    rotated,
    Math.round(region.x),
    Math.round(region.y),
    size,
    size,
    0,
    0,
    size,
    size,
  );

  const blob = await new Promise<Blob | null>((resolve) => {
    output.toBlob(resolve, 'image/png');
  });
  if (!blob) throw new Error('canvas.toBlob returned null');

  return { url: URL.createObjectURL(blob), size };
}

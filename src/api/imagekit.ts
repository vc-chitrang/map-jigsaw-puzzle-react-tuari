/**
 * ImageKit thumbnail URLs.
 *
 * Ported from `CardItemUI.BuildPlaceholderUrl`. Card thumbnails must NOT load
 * `primary_image` directly: those are 4K masters, and forty of them in a grid
 * would saturate the connection and the decoder. Unity loads a 600 px-wide
 * ImageKit render first and upgrades afterwards; the grid here just uses the
 * 600 px render, since a card is never larger than ~320 reference px.
 *
 *   https://ik.imagekit.io/map/tr:n-image_w600/map/artwork/{basename}.jpg
 *
 * The transformation name (`n-image_w600`) is a NAMED transformation configured
 * on MAP's ImageKit account — it is not a width parameter that can be varied
 * freely. Do not invent other names.
 */

const IMAGEKIT_BASE = 'https://ik.imagekit.io/map/tr:n-image_w600/map/artwork';

/**
 * @returns the thumbnail URL, or null when a basename cannot be derived — in
 * which case the caller should fall back to `primary_image`.
 */
export function thumbnailUrl(primaryImageUrl: string): string | null {
  if (!primaryImageUrl) return null;

  // Path.GetFileNameWithoutExtension, then strip any backslashes as Unity does.
  const withoutQuery = primaryImageUrl.split(/[?#]/)[0] ?? '';
  const lastSegment = withoutQuery.replace(/\\/g, '/').split('/').pop() ?? '';
  if (!lastSegment) return null;

  const dot = lastSegment.lastIndexOf('.');
  const basename = dot > 0 ? lastSegment.slice(0, dot) : lastSegment;
  if (!basename) return null;

  return `${IMAGEKIT_BASE}/${encodeURIComponent(basename)}.jpg`;
}

/** Thumbnail if one can be derived, otherwise the master image. */
export function cardImageUrl(primaryImageUrl: string): string {
  return thumbnailUrl(primaryImageUrl) ?? primaryImageUrl;
}

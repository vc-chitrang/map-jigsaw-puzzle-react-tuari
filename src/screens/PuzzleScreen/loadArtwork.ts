import { fetchCollection, fetchImageAsBlobUrl } from '../../api/client';
import { hasImage, type ResultsData } from '../../api/types';
import { cropToSquare, pickFallbackArtwork, releaseArtwork } from '../../image/cropToSquare';
import type { ArtworkIdentity } from '../../game';

/**
 * Loading the board's artwork, square-cropped and ready to slice.
 *
 * Two sources, matching Unity:
 *
 * * **Collection** — pick a random artwork that has a `primary_image`
 *   (`game-logic.md §8.6`). The bytes come through the Rust `image_fetch` command,
 *   not an `<img>` tag: the board crops on a `<canvas>`, and a cross-origin image
 *   without CORS headers taints the canvas so `toBlob()` throws.
 * * **Bundled fallback** — the textures copied out of the Unity `Textures` folder.
 *   The kiosk must stay playable with no network
 *   (project-overview.md non-negotiable 4).
 */

export interface LoadedArtwork {
  /** Blob URL of the square crop. */
  readonly url: string;
  /** Drives the per-artwork high-score key. */
  readonly identity: ArtworkIdentity;
  /** Where it came from, for logging and for the offline notice. */
  readonly source: 'collection' | 'fallback';
  /** Releases every blob URL this load created. */
  release(): void;
}

/** Crop a URL to a square, releasing an intermediate blob if one was created. */
async function cropAndTrack(url: string, intermediate: string | null): Promise<{
  cropped: string;
  release: () => void;
}> {
  const artwork = await cropToSquare(url);

  return {
    cropped: artwork.url,
    release: () => {
      releaseArtwork(artwork);
      // `cropToSquare` returns its input unchanged for an already-square image, so
      // only revoke the intermediate when it is not the value we handed back.
      if (intermediate && intermediate !== artwork.url) URL.revokeObjectURL(intermediate);
    },
  };
}

/**
 * Adopt an already-square image, as produced by the Crop screen.
 *
 * No cropping: `exportCrop` has already made it square, and re-cropping would
 * resample it for nothing.
 *
 * **Ownership stays with the caller**, so `release()` is a no-op. It used to
 * revoke, and that was wrong in two ways: the owner still held the same URL in
 * state, so a remount (START then Back) adopted an already-revoked URL and the
 * board rendered BLACK; and under React 18 StrictMode the mount-cleanup-mount
 * cycle revoked it before the first paint. Whoever created the blob revokes it —
 * see `replacePreparedArtwork` in `App.tsx`.
 */
export function adoptPreparedArtwork(url: string, title: string): LoadedArtwork {
  return {
    url,
    // A QR upload has no title, so the key falls through to "Default" exactly as
    // it does in Unity.
    identity: { artworkTitle: title },
    source: 'collection',
    release: () => {},
  };
}

/** Load a specific collection artwork — used when a visitor taps a card. */
export async function loadArtworkFromCollection(item: ResultsData): Promise<LoadedArtwork> {
  const blobUrl = await fetchImageAsBlobUrl(item.primary_image);
  const { cropped, release } = await cropAndTrack(blobUrl, blobUrl);

  return {
    url: cropped,
    // Title drives the high-score key; a blank title falls through to "Default".
    identity: { artworkTitle: item.title ?? '' },
    source: 'collection',
    release,
  };
}

/** Bundled offline artwork. */
export async function loadFallbackArtwork(rng: () => number = Math.random): Promise<LoadedArtwork> {
  const source = pickFallbackArtwork(rng);
  const { cropped, release } = await cropAndTrack(source, null);

  return {
    url: cropped,
    // No artwork title offline, so the key falls back to the texture name, which
    // is exactly what Unity does.
    identity: { textureName: source.split('/').pop() ?? 'Default' },
    source: 'fallback',
    release,
  };
}

/**
 * Boot / "New Image" / "Play Again" artwork: a collection piece, falling back to
 * the bundled set.
 *
 * **Collection FIRST, and awaited.** An earlier version returned the bundled
 * image immediately and let a second effect swap in the collection piece
 * afterwards (ADR-043). That gave two owners for one piece of board state and
 * they raced: the bundled load always carries a title-less identity, so whenever
 * it settled second — which the warm Rust caches make common, since a cached
 * collection page resolves in ~1 ms while cropping a bundled JPEG does not — it
 * overwrote the titled identity and the artwork name vanished. Superseded by
 * ADR-045: one sequential load, one owner, and a loading screen over it.
 *
 * Every failure path ends in the bundled set rather than an error state — a kiosk
 * showing a different picture beats a kiosk showing an error
 * (project-overview.md non-negotiable 4).
 */
export async function loadRandomArtwork(rng: () => number = Math.random): Promise<LoadedArtwork> {
  try {
    return await loadCollectionArtwork(rng);
  } catch (error) {
    console.info('[puzzle] collection unavailable; using the bundled artwork', error);
    return loadFallbackArtwork(rng);
  }
}

/**
 * A random collection artwork.
 *
 * Mirrors Unity's launch mode — `GameManager.OnAPIDataForLaunch` picks a random
 * API result and takes `chosen.title`, which is why its attract board carries an
 * artwork name and the bundled images do not.
 *
 * **Prefers an item that actually has a title.** Not every collection record has
 * one, and picking blind meant the name above the board was sometimes empty on a
 * perfectly good image — indistinguishable from the bug above. Falls back to any
 * playable item if the whole page is untitled, since a picture with no name still
 * beats no picture.
 *
 * Throws on any failure; `loadRandomArtwork` is what degrades to the bundled set.
 */
export async function loadCollectionArtwork(
  rng: () => number = Math.random,
): Promise<LoadedArtwork> {
  const data = await fetchCollection({ page: 1 });

  // Only artworks with an image can become a puzzle (game-logic §8.6).
  const playable = data.results.data.filter(hasImage);
  if (playable.length === 0) throw new Error('the collection returned no artwork with an image');

  const titled = playable.filter((item) => (item.title ?? '').trim().length > 0);
  const pool = titled.length > 0 ? titled : playable;

  const index = Math.min(Math.floor(rng() * pool.length), pool.length - 1);
  const item = pool[index] ?? pool[0];
  if (!item) throw new Error('the collection returned no artwork with an image');

  return loadArtworkFromCollection(item);
}

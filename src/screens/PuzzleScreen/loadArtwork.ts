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
 * Boot / "New Image" artwork: the bundled set, loaded instantly.
 *
 * Deliberately does NOT touch the network (ADR-028): a blocking collection query
 * plus a 4-7 MB master made the app hang for 12-15 s on launch. The collection
 * piece arrives afterwards, in the background — see `loadCollectionArtwork`.
 */
export async function loadRandomArtwork(rng: () => number = Math.random): Promise<LoadedArtwork> {
  return loadFallbackArtwork(rng);
}

/**
 * A random collection artwork, for attract mode.
 *
 * Unity's launch mode does the same thing — `GameManager.OnAPIDataForLaunch`
 * picks a random API result and takes `chosen.title` — which is why the attract
 * board has an artwork name above it there and the bundled images have none.
 *
 * The port calls this AFTER the bundled image is already on screen, so the 0 ms
 * boot from ADR-028 is kept and the titled artwork replaces it a moment later.
 * Throws on any failure; the caller keeps the bundled image and stays silent.
 */
export async function loadCollectionArtwork(
  rng: () => number = Math.random,
): Promise<LoadedArtwork> {
  const data = await fetchCollection({ page: 1 });

  // Only artworks with an image can become a puzzle (game-logic §8.6).
  const playable = data.results.data.filter(hasImage);
  if (playable.length === 0) throw new Error('the collection returned no artwork with an image');

  const index = Math.min(Math.floor(rng() * playable.length), playable.length - 1);
  const item = playable[index] ?? playable[0];
  if (!item) throw new Error('the collection returned no artwork with an image');

  return loadArtworkFromCollection(item);
}

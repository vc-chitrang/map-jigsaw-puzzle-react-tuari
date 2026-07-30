import { fetchImageAsBlobUrl } from '../../api/client';
import type { ResultsData } from '../../api/types';
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
 * Boot / "New Image" artwork: a random collection piece, falling back to the
 * bundled set on any failure.
 *
 * Every failure path ends in the fallback rather than an error state — a kiosk
 * showing an error message is worse than a kiosk showing a different picture.
 */
export async function loadRandomArtwork(rng: () => number = Math.random): Promise<LoadedArtwork> {
  return loadFallbackArtwork(rng);
}

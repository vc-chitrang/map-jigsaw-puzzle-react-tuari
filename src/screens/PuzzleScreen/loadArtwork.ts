import { StaleResponseError, fetchCollection, fetchImageAsBlobUrl } from '../../api/client';
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
  /** Display data — the name above the board. */
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
 * The artwork the HOME screen always shows.
 *
 * Client directive, 2026-08-04: the home screen must present this one piece every
 * time rather than a random collection artwork.
 *
 *   https://map-india.org/collections/cumulus/modern-contemporary-art/MAC.00468/?id=2824
 *
 * All three fields were read back from the live API (`npm run check:api --
 * -Query MAC.00468`), which returns exactly one record: `id` 2824, accession
 * MAC.00468, department "Modern & Contemporary Art", title "Universe", image
 * present. `id` matches the `?id=` in that URL.
 *
 * The lookup goes through `q=<accession>` because the collection API has no
 * fetch-by-id route; `id` is then used to pick the exact record out of the result,
 * with the accession as a second check. `title` is here only so a mismatch is
 * obvious in a diff if MAC.00468 is ever re-catalogued — nothing reads it.
 */
export const FEATURED_HOME_ARTWORK = {
  id: 2824,
  accession: 'MAC.00468',
  title: 'Universe',
} as const;

/**
 * Fetch the one artwork the home screen is pinned to.
 *
 * Throws if it cannot be found or has no image, so `loadHomeArtwork` can fall
 * through rather than leaving the board empty.
 */
export async function loadFeaturedArtwork(): Promise<LoadedArtwork> {
  const data = await fetchCollection({ q: FEATURED_HOME_ARTWORK.accession });
  const playable = data.results.data.filter(hasImage);

  // Prefer the id, since a `q` search could in principle match more than one
  // record; fall back to the accession in case ids are ever renumbered.
  const item =
    playable.find((candidate) => candidate.id === FEATURED_HOME_ARTWORK.id) ??
    playable.find(
      (candidate) => candidate.accession_number === FEATURED_HOME_ARTWORK.accession,
    );

  if (!item) {
    throw new Error(
      `featured artwork ${FEATURED_HOME_ARTWORK.accession} (id ${FEATURED_HOME_ARTWORK.id}) not found or has no image`,
    );
  }

  return loadArtworkFromCollection(item);
}

/**
 * Artwork for the HOME screen — boot, Home, and any return to attract mode.
 *
 * **There is no random tier, deliberately.** The home screen shows
 * `FEATURED_HOME_ARTWORK` or, if the collection cannot be reached at all, the FIRST
 * bundled offline image. Nothing here picks at random.
 *
 * That is not just the client's preference, it fixes a real bug. A previous version
 * fell back to a random collection piece when the featured fetch failed, and
 * `StrictMode` double-invokes this screen's load effect — two `fetchCollection`
 * calls, and `fetchCollection`'s module-global request-id guard makes the older one
 * throw `StaleResponseError`. That benign staleness was being treated as "the
 * featured artwork is unavailable", so the home screen loaded a RANDOM artwork.
 * With no random tier, no code path can put an unexpected artwork on the board.
 *
 * `StaleResponseError` is now rethrown rather than absorbed: a superseded request
 * means a NEWER load is already running, so falling back here would let the offline
 * image stomp the featured one that is about to arrive.
 *
 * The bundled fallback is picked with a FIXED rng so even the offline board is the
 * same picture every time.
 */
export async function loadHomeArtwork(): Promise<LoadedArtwork> {
  try {
    return await loadFeaturedArtwork();
  } catch (error) {
    if (error instanceof StaleResponseError) throw error;
    console.info('[puzzle] featured artwork unavailable; using the bundled image', error);
    // `() => 0` -> always the first bundled image, never a random one.
    return loadFallbackArtwork(() => 0);
  }
}

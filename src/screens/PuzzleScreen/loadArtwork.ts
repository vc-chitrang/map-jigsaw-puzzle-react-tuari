import { fetchCollection, fetchImageAsBlobUrl } from '../../api/client';
import { hasImage, type ResultsData } from '../../api/types';
import { pickArtwork } from './pickArtwork';
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
  /**
   * Collection record id, when it came from the collection.
   *
   * Fed back as `exclude` on the next load so "Play Again" cannot serve the piece
   * just finished. Kept off `identity` on purpose: that is display data, and the
   * high score has been global since ADR-041.
   */
  readonly collectionId?: number;
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
    collectionId: item.id,
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
 * Artwork for the HOME screen — boot, Home, and "New Image" when nothing else
 * supplies one.
 *
 * Three tiers, in order:
 *
 *   1. **The featured artwork** (`FEATURED_HOME_ARTWORK`) — what the client asked
 *      for, and what the home screen shows in normal operation.
 *   2. **A random collection piece** if that record cannot be fetched. Better than
 *      dropping straight to the offline set: the visitor still sees real MAP
 *      artwork with a real title.
 *   3. **The bundled offline set** if the collection is unreachable at all.
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
 * Every failure path ends in a picture rather than an error state — a kiosk
 * showing a different picture beats a kiosk showing an error
 * (project-overview.md non-negotiable 4).
 */
export async function loadHomeArtwork(
  rng: () => number = Math.random,
  recent: readonly number[] = [],
): Promise<LoadedArtwork> {
  try {
    return await loadFeaturedArtwork();
  } catch (error) {
    console.info('[puzzle] featured artwork unavailable; picking another', error);
  }

  try {
    return await loadCollectionArtwork(rng, recent);
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
 * **`recent` is a guarantee, not a nudge.** Random selection alone gave "Play
 * Again" a 1-in-40 chance of handing back the artwork just finished. The caller
 * passes the recently-played ids, most recent first, and `pickArtwork` relaxes
 * that window from the OLD end — so the artwork just played is the very last thing
 * it will reconsider.
 *
 * **Known limitation:** only page 1 is fetched, so the kiosk draws from 40 records
 * out of ~32,300. That keeps every load on the 24 h Rust cache (~1 ms) instead of
 * an ~8 s uncached page fetch per build, which matters now that the visitor waits
 * behind the build scrim. Widening it means randomising `page` across
 * `pagination.last_page` and accepting that cost.
 *
 * Throws on any failure; `loadHomeArtwork` is what degrades to the bundled set.
 */
export async function loadCollectionArtwork(
  rng: () => number = Math.random,
  recent: readonly number[] = [],
): Promise<LoadedArtwork> {
  const data = await fetchCollection({ page: 1 });

  const item = pickArtwork(data.results.data, rng, recent);
  if (!item) throw new Error('the collection returned no artwork with an image');

  return loadArtworkFromCollection(item);
}

import { invoke } from '@tauri-apps/api/core';
import { ITEMS_PER_PAGE } from '../game';
import type { CollectionParams, MAPData } from './types';

/**
 * Collection API client.
 *
 * Every request goes through the Rust `collection_fetch` command, so the API key
 * never exists in renderer JavaScript (ADR-009).
 *
 * STALE-RESPONSE GUARD — the important part. A visitor typing in the search box
 * or flicking through filters fires requests faster than they resolve, and
 * Unity's `_fetchId` counter exists so a slow earlier response cannot overwrite a
 * fast later one (docs/game-logic.md §8.4).
 *
 * The docs suggest `AbortController`. That works for `fetch`, but Tauri's `invoke`
 * returns a plain promise with no cancellation, so aborting is not available at
 * this boundary; the request id is what actually provides the guarantee. An
 * `AbortSignal` is still accepted so a caller that unmounts can drop its result,
 * and so the shape is right if this ever moves back to `fetch`.
 */

export class StaleResponseError extends Error {
  constructor() {
    super('superseded by a newer request');
    this.name = 'StaleResponseError';
  }
}

export class NotConfiguredError extends Error {
  constructor() {
    super('the collection API is not configured');
    this.name = 'NotConfiguredError';
  }
}

/** Mirrors Unity's `_fetchId`. Monotonic for the life of the process. */
let currentFetchId = 0;

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface PublicConfig {
  readonly socketUrl: string;
  readonly collectionAvailable: boolean;
  /** Empty when the upload feature is not configured server-side. */
  readonly uploadUrl: string;
}

let publicConfigPromise: Promise<PublicConfig> | null = null;

/** Non-secret runtime config. Cached: it cannot change while the app runs. */
export function getPublicConfig(): Promise<PublicConfig> {
  if (!isTauri()) {
    // Browser development: there is no Rust side, so the collection is absent
    // and the app takes its offline path. That is the correct behaviour, not an error.
    return Promise.resolve({ socketUrl: '', collectionAvailable: false, uploadUrl: '' });
  }

  publicConfigPromise ??= invoke<{
    socket_url: string;
    collection_available: boolean;
    upload_url: string;
  }>('public_config')
    .then((raw) => ({
      socketUrl: raw.socket_url,
      collectionAvailable: raw.collection_available,
      uploadUrl: raw.upload_url,
    }))
    .catch((error) => {
      console.error('[api] public_config failed', error);
      return { socketUrl: '', collectionAvailable: false, uploadUrl: '' };
    });

  return publicConfigPromise;
}

export interface FetchOptions {
  readonly signal?: AbortSignal;
}

/**
 * Fetch a page of the collection.
 *
 * @throws {StaleResponseError} if a newer request started before this resolved.
 * @throws {NotConfiguredError} if the API has no base URL or key.
 */
export async function fetchCollection(
  params: CollectionParams = {},
  options: FetchOptions = {},
): Promise<MAPData> {
  if (!isTauri()) throw new NotConfiguredError();

  const fetchId = ++currentFetchId;

  const payload: CollectionParams = {
    limit: params.limit ?? ITEMS_PER_PAGE,
    page: params.page ?? 1,
    ...params,
  };

  let raw: unknown;
  try {
    raw = await invoke<unknown>('collection_fetch', { params: payload });
  } catch (error) {
    // The Rust side stringifies its error; match on the configured case so the
    // UI can show the offline state instead of a failure.
    if (typeof error === 'string' && error.includes('not configured')) {
      throw new NotConfiguredError();
    }
    throw error instanceof Error ? error : new Error(String(error));
  }

  // Discard a response that a newer request has already superseded.
  if (fetchId !== currentFetchId) throw new StaleResponseError();
  if (options.signal?.aborted) throw new StaleResponseError();

  if (!isMapData(raw)) {
    throw new Error('the collection API returned an unexpected shape');
  }

  return raw;
}

/**
 * Structural check on the response.
 *
 * Not a full validation: it confirms the two paths the UI dereferences
 * (`results.data`, `results.pagination`) so a shape change surfaces here with a
 * clear message rather than as `undefined` deep inside a render.
 */
function isMapData(value: unknown): value is MAPData {
  if (typeof value !== 'object' || value === null) return false;
  const results = (value as { results?: unknown }).results;
  if (typeof results !== 'object' || results === null) return false;
  const data = (results as { data?: unknown }).data;
  const pagination = (results as { pagination?: unknown }).pagination;
  return Array.isArray(data) && typeof pagination === 'object' && pagination !== null;
}

/**
 * Fetch an image through Rust and return a blob URL.
 *
 * Needed because the board crops artwork to a square on a `<canvas>`, and a
 * cross-origin image without CORS headers taints the canvas so `toBlob()` throws.
 * Card thumbnails do not need this — they are only ever displayed, so they can
 * load straight from the CDN via `<img>`.
 *
 * Revoke the returned URL with `URL.revokeObjectURL` when done.
 */
export async function fetchImageAsBlobUrl(url: string): Promise<string> {
  if (!isTauri()) return url;

  const bytes = await invoke<ArrayBuffer | number[]>('image_fetch', { url });
  const buffer = bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes).buffer;
  return URL.createObjectURL(new Blob([buffer]));
}

/** Test seam: resets the request-id counter. */
export function __resetFetchIdForTests(): void {
  currentFetchId = 0;
}

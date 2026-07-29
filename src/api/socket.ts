import { io, type Socket } from 'socket.io-client';
import { getPublicConfig } from './client';

/**
 * QR phone upload — Socket.IO `new-upload`.
 *
 * Ports `SocketConnection` (docs/game-logic.md §9):
 *
 *   URL   : https://i-am-puzzle.map-india.org  (from the Rust `public_config`)
 *   event : "new-upload" -> payload carrying an image URL
 *
 * `transports: ['polling']` matches the Unity client. WebSocket would be more
 * efficient, but the Unity build has been running against this server on polling,
 * and a museum network that permits polling may not permit an upgrade — matching
 * the shipped behaviour is the safer default.
 *
 * VISIBILITY GATE: `UIManager.OnImageReceived` accepts an upload ONLY while the
 * ImageSelect or Crop screen is showing. That lets a visitor scan a second QR
 * while already cropping and have the image replaced in place, and it stops an
 * upload from hijacking someone else's game in progress. The gate lives with the
 * caller, which knows the current screen; this module just delivers events.
 */

/** Payload key names seen on the wire, in the order they are tried. */
const URL_KEYS = ['url', 'imageUrl', 'image_url', 'image', 'path'] as const;

/** Wrapper keys worth looking inside, e.g. `{ data: { url } }`. */
const WRAPPER_KEYS = ['data', 'payload', 'result'] as const;

/**
 * Depth bound on the search.
 *
 * Socket.IO payloads arrive JSON-parsed, so a cycle is not actually reachable —
 * but an explicit bound means the recursion cannot be unbounded by accident, and
 * four levels is far more nesting than any plausible payload.
 */
const MAX_DEPTH = 4;

/**
 * Pull an image URL out of a `new-upload` payload.
 *
 * The exact shape is not documented — the Unity handler only says "payload
 * contains an image URL" — so this accepts a bare string, or an object using any
 * of the common key spellings, optionally inside a wrapper. Guessing a single
 * shape would fail silently on the kiosk, which is the worst outcome here.
 *
 * Exported for unit testing.
 */
export function extractImageUrl(payload: unknown, depth = 0): string | null {
  if (depth > MAX_DEPTH) return null;

  if (typeof payload === 'string') {
    return payload.trim() || null;
  }

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const found = extractImageUrl(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>;

    for (const key of URL_KEYS) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }

    for (const nested of WRAPPER_KEYS) {
      const value = record[nested];
      if (value && typeof value === 'object') {
        const found = extractImageUrl(value, depth + 1);
        if (found) return found;
      }
    }
  }

  return null;
}

export interface UploadSocketHandlers {
  onImageUrl(url: string): void;
  onStatus?(connected: boolean): void;
}

export interface UploadSocket {
  disconnect(): void;
}

/**
 * Connect and listen for uploads.
 *
 * Returns immediately; connection happens in the background. A socket failure is
 * logged and otherwise ignored — the kiosk stays fully usable without QR upload,
 * so this must never surface as a blocking error.
 */
export async function connectUploadSocket(
  handlers: UploadSocketHandlers,
): Promise<UploadSocket | null> {
  const config = await getPublicConfig();
  if (!config.socketUrl) {
    console.info('[socket] no socket URL configured; QR upload is unavailable');
    return null;
  }

  let socket: Socket;
  try {
    socket = io(config.socketUrl, {
      transports: ['polling'],
      // A kiosk runs for weeks; keep retrying rather than giving up.
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
      timeout: 20000,
    });
  } catch (error) {
    console.error('[socket] could not create the connection', error);
    return null;
  }

  socket.on('connect', () => {
    console.info('[socket] connected');
    handlers.onStatus?.(true);
  });

  socket.on('disconnect', (reason) => {
    console.info('[socket] disconnected:', reason);
    handlers.onStatus?.(false);
  });

  socket.on('connect_error', (error) => {
    // Expected whenever the kiosk is offline. Info, not error.
    console.info('[socket] connect error:', error.message);
    handlers.onStatus?.(false);
  });

  socket.on('new-upload', (payload: unknown) => {
    const url = extractImageUrl(payload);
    if (!url) {
      console.warn('[socket] new-upload had no recognisable image URL', payload);
      return;
    }
    handlers.onImageUrl(url);
  });

  return {
    disconnect: () => {
      socket.removeAllListeners();
      socket.disconnect();
    },
  };
}

/// <reference types="vite/client" />

/**
 * App version, injected by vite.config.ts from package.json at build time.
 * Never hardcode a version anywhere else.
 */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** `portrait` (default, primary kiosk build) or `landscape`. */
  readonly VITE_ORIENTATION?: 'portrait' | 'landscape';
  /** `1` renders the Phase 0 pixel-parity harness instead of the app. */
  readonly VITE_PARITY_HARNESS?: string;
  /** `1` hides the version badge — use it for pixel-parity captures. */
  readonly VITE_HIDE_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

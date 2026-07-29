import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

// Tauri expects a fixed port and no auto-clearing of the terminal.
// 1420 is Tauri's convention; keep it in sync with src-tauri/tauri.conf.json devUrl.
const DEV_PORT = 1420;

/**
 * package.json is the single source of truth for the version; scripts/bump-version.ps1
 * copies it into tauri.conf.json and Cargo.toml. Reading it here means the UI badge
 * and the installer can never disagree.
 */
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Tauri serves the built app from a custom protocol; relative asset URLs are required.
  base: './',
  clearScreen: false,
  server: {
    port: DEV_PORT,
    strictPort: true,
    host: '127.0.0.1',
    watch: {
      // Rust sources and copied binary assets are not part of the front-end graph.
      ignored: ['**/src-tauri/**', '**/captures/**'],
    },
  },
  build: {
    // Chromium (WebView2) only — no legacy transpile needed.
    target: 'chrome120',
    sourcemap: true,
    // 4K PNG artwork is copied verbatim; don't inline anything as base64.
    assetsInlineLimit: 0,
  },
});

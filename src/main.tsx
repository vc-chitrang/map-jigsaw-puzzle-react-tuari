import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';

import { installExitHatch } from './kiosk/exitHatch';
import { installKioskLockdown } from './kiosk/lockdown';
import { App } from './App';
import './styles/global.css';

/*
 * Order matters.
 *
 * The exit hatch and the lockdown are installed BEFORE React renders and are
 * never torn down. The window ships fullscreen/undecorated/always-on-top, so if
 * the React tree throws during mount the double-Esc gesture must still work —
 * otherwise the kiosk can only be recovered by cutting power.
 */
installExitHatch();
installKioskLockdown();

// Keep mouse cursor visible in both dev and production builds.
if (import.meta.env.VITE_HIDE_CURSOR === '1') {
  document.documentElement.dataset['cursor'] = 'hidden';
}

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/*
 * Tell the shell we have painted, so it can show the window.
 *
 * The window is created hidden (`visible: false`). Without that, launching showed
 * the raw 960x540 decorated frame — white, because WebView2 had not painted — for
 * about a second before `kiosk.rs` promoted it to fullscreen.
 *
 * TWO nested frames, not one: the first fires before the browser has painted the
 * commit, the second after. Showing on the first still reveals a blank window, just
 * more briefly.
 *
 * Failure is ignored on purpose. Outside Tauri (`npm run dev`) there is no command
 * to call, and if the call fails inside Tauri the Rust-side failsafe timer shows the
 * window regardless — see `REVEAL_FAILSAFE_MS` in `src-tauri/src/lib.rs`.
 */
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    void invoke('app_ready').catch(() => {});
  });
});

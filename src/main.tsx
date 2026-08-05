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

/** Fade out the static splash from index.html, then take it out of the DOM. */
function dismissSplash(): void {
  const splash = document.getElementById('splash');
  if (!splash) return;

  splash.dataset['hidden'] = 'true';
  // Matches the 300 ms transition in index.html, plus a little slack. Driven by a
  // timer rather than `transitionend`, which never fires if the element is not
  // composited (a reduced-motion or background tab case) and would strand the
  // splash over the whole UI.
  window.setTimeout(() => splash.remove(), 400);
}

/*
 * First paint: drop the splash and tell the shell it can show the window.
 *
 * The window is created hidden (`visible: false`). Without that, launching showed
 * the raw 960x540 decorated frame — white, because WebView2 had not painted — for
 * about a second before `kiosk.rs` promoted it to fullscreen.
 *
 * TWO nested frames, not one: the first fires before the browser has painted the
 * commit, the second after. Acting on the first still reveals a blank window, just
 * more briefly.
 *
 * The splash is dismissed BEFORE the invoke, and the invoke is wrapped, because
 * `invoke` throws synchronously outside Tauri (`npm run dev`). Doing it the other
 * way round would leave the splash covering the whole UI in the browser.
 */
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    // Show the window immediately so the splash is visible straight away.
    // Ignored on failure: outside Tauri there is no command to call, and inside it
    // the Rust failsafe timer shows the window regardless — see
    // `REVEAL_FAILSAFE_MS` in `src-tauri/src/lib.rs`.
    try {
      void invoke('app_ready').catch(() => {});
    } catch {
      /* not running under Tauri */
    }

    // Hold the splash for at least 1 s so the visitor sees it before the app
    // transition kicks in.
    window.setTimeout(dismissSplash, 1000);
  });
});

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

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

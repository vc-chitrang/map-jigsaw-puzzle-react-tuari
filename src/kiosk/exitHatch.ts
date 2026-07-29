/**
 * Staff exit hatch — double-Esc within 1 s closes the kiosk.
 *
 * The Unity build uses `QuitOnDoubleEsc`; the gesture is unchanged so museum
 * staff need no retraining.
 *
 * WHY THIS IS INSTALLED FROM main.tsx, OUTSIDE REACT:
 * the window ships fullscreen, undecorated and always-on-top. If the React tree
 * failed to mount there would be no way to close it — the machine would need a
 * hard power cycle. Registering the listener before render, at module scope,
 * means the hatch survives any renderer failure.
 */

import { getCurrentWindow } from '@tauri-apps/api/window';

/** Max gap between the two Esc presses, in ms. Matches the Unity implementation. */
export const DOUBLE_ESC_WINDOW_MS = 1000;

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function quit(): Promise<void> {
  if (!isTauri()) {
    console.info('[exit-hatch] double-Esc detected (no-op outside Tauri)');
    return;
  }

  try {
    await getCurrentWindow().close();
  } catch (error) {
    // Never swallow this silently: if close() fails the operator is stuck.
    console.error('[exit-hatch] window.close() failed', error);
  }
}

/**
 * @returns an uninstall function (used by tests; production never uninstalls).
 */
export function installExitHatch(): () => void {
  let lastEscAt = 0;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;

    const now = event.timeStamp;
    if (now - lastEscAt <= DOUBLE_ESC_WINDOW_MS && lastEscAt !== 0) {
      lastEscAt = 0;
      void quit();
      return;
    }
    lastEscAt = now;
  };

  // Capture phase: an input field or modal must never be able to swallow it.
  window.addEventListener('keydown', onKeyDown, { capture: true });
  return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
}

/**
 * Kiosk lockdown — remove every browser affordance a museum visitor could reach.
 *
 * The CSS half of this lives in src/styles/global.css (`user-select`,
 * `touch-action`, `overscroll-behavior`, `overflow`). This module covers the
 * parts that need JavaScript.
 *
 * Installed from main.tsx alongside the exit hatch, before React renders.
 */

const isProduction = import.meta.env.PROD;

/** Keys that would reload, print, open devtools, or otherwise break the kiosk. */
function isBlockedKey(event: KeyboardEvent): boolean {
  const key = event.key;

  // Browser zoom: Ctrl +, Ctrl -, Ctrl 0 (and the numpad variants).
  if ((event.ctrlKey || event.metaKey) && ['+', '-', '=', '0'].includes(key)) return true;

  // Reload / hard reload / print / find / save.
  if ((event.ctrlKey || event.metaKey) && ['r', 'R', 'p', 'P', 'f', 'F', 's', 'S'].includes(key)) {
    return true;
  }

  if (key === 'F5') return true;

  // DevTools — left available in dev builds on purpose.
  if (isProduction) {
    if (key === 'F12') return true;
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(key)) {
      return true;
    }
  }

  return false;
}

export function installKioskLockdown(): () => void {
  const suppress = (event: Event) => event.preventDefault();

  const onKeyDown = (event: KeyboardEvent) => {
    if (isBlockedKey(event)) event.preventDefault();
  };

  // Ctrl+wheel is pinch-zoom on a trackpad and zoom on a mouse; both must die.
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey) event.preventDefault();
  };

  // Safari/WebView2 gesture events for pinch zoom.
  const gestureEvents = ['gesturestart', 'gesturechange', 'gestureend'] as const;

  document.addEventListener('contextmenu', suppress);
  document.addEventListener('selectstart', suppress);
  document.addEventListener('dragstart', suppress);
  window.addEventListener('keydown', onKeyDown, { capture: true });
  // `passive: false` is required or preventDefault() is ignored.
  window.addEventListener('wheel', onWheel, { passive: false });
  for (const name of gestureEvents) document.addEventListener(name, suppress);

  return () => {
    document.removeEventListener('contextmenu', suppress);
    document.removeEventListener('selectstart', suppress);
    document.removeEventListener('dragstart', suppress);
    window.removeEventListener('keydown', onKeyDown, { capture: true });
    window.removeEventListener('wheel', onWheel);
    for (const name of gestureEvents) document.removeEventListener(name, suppress);
  };
}

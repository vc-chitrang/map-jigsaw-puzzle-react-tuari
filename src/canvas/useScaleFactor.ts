import { useEffect, useLayoutEffect, useState } from 'react';
import { computeScaleFactor, type ReferenceSize } from './reference';

/**
 * Live Unity-equivalent canvas scale factor for the current window size.
 *
 * This is the ONLY place in the app that reads viewport dimensions for layout.
 * Everything else works in reference pixels inside <ScaledCanvas>.
 */
export function useScaleFactor(reference: ReferenceSize): number {
  const [scale, setScale] = useState(() =>
    computeScaleFactor(window.innerWidth, window.innerHeight, reference),
  );

  // Layout effect: measure before first paint so the canvas never flashes at
  // the wrong size on a display whose size differs from the SSR-free initial read.
  useLayoutEffect(() => {
    setScale(computeScaleFactor(window.innerWidth, window.innerHeight, reference));
  }, [reference]);

  useEffect(() => {
    const update = () => {
      setScale(computeScaleFactor(window.innerWidth, window.innerHeight, reference));
    };

    window.addEventListener('resize', update);
    // A kiosk display can change DPI/orientation without a resize event on some
    // WebView2 versions; visualViewport covers that case.
    window.visualViewport?.addEventListener('resize', update);

    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, [reference]);

  return scale;
}

/** Window size, for the dev parity readout. Not used for layout. */
export function useViewportSize(): { w: number; h: number; dpr: number } {
  const read = () => ({
    w: window.innerWidth,
    h: window.innerHeight,
    dpr: window.devicePixelRatio,
  });

  const [size, setSize] = useState(read);

  useEffect(() => {
    const update = () => setSize(read());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return size;
}

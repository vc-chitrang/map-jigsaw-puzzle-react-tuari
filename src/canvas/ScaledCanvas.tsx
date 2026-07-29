import type { ReactNode } from 'react';
import { useScaleFactor } from './useScaleFactor';
import { REF, type ReferenceSize } from './reference';
import styles from './ScaledCanvas.module.css';

interface ScaledCanvasProps {
  children: ReactNode;
  /** Override for tests / the landscape build. Defaults to the active orientation. */
  reference?: ReferenceSize;
}

/**
 * The single scaling boundary of the application.
 *
 * Renders its children at literal reference-resolution pixels and scales the
 * whole subtree with one GPU-composited `transform: scale()`. Inside it, Unity
 * numbers are used verbatim: `size=(124,124)` is `width:124px; height:124px`.
 *
 * Deliberately NOT `zoom` (re-runs layout, rounds to integer px) and NOT `rem`
 * scaling (breaks text metrics vs Unity's SDF). See docs/decisions.md ADR-007.
 */
export function ScaledCanvas({ children, reference = REF }: ScaledCanvasProps) {
  const scale = useScaleFactor(reference);

  return (
    <div className={styles.viewport}>
      <div
        className={styles.canvas}
        style={{
          width: `${reference.w}px`,
          height: `${reference.h}px`,
          transform: `translate(-50%, -50%) scale(${scale})`,
          // Expose the factor for anything that must undo it (e.g. converting a
          // pointer event back into reference px on the crop canvas).
          ['--canvas-scale' as string]: String(scale),
        }}
      >
        {children}
      </div>
    </div>
  );
}

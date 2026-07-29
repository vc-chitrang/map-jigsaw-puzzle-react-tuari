import { REF, ORIENTATION, computeScaleFactor } from '../canvas/reference';
import { useViewportSize } from '../canvas/useScaleFactor';
import styles from './ParityHarness.module.css';

/**
 * Phase 0 verification target.
 *
 * Renders the reference bounds, a 100 px grid, and three elements whose Unity
 * values are worked through by hand in docs/pixel-perfect-replication.md §3 —
 * one per RectTransform idiom. Screenshot this next to the Unity capture at the
 * same window size and diff numerically (scripts/pixel-diff.mjs).
 *
 * Every number below is quoted from the docs, not derived here.
 */

/** Idiom B — point anchor + fixed size. pixel-perfect-replication.md §3.3. */
const BACK_BUTTON = {
  // anchorMin = anchorMax = (0, 0.5), pos = (40, 60), size = 124×124, pivot = (0, 0.5)
  //   cssLeft = 0 + 40 − 0×124             = 40px
  //   cssTop  = 0.5×H − 60 − 0.5×124       = 50% − 122px
  left: '40px',
  top: 'calc(50% - 122px)',
  width: '124px',
  height: '124px',
} as const;

/** Idiom A — fractional anchors. pixel-perfect-replication.md §3.2. */
const START_BUTTON = {
  // anchorMin = (0.233, 0.3202), anchorMax = (0.4766, 0.3707)
  //   top = (1 − 0.3707) × 100 = 62.93%
  left: '23.300%',
  width: '24.360%',
  top: '62.930%',
  height: '5.050%',
} as const;

/** Idiom A — AppLogo. ui-spec.md §4.1. */
const APP_LOGO = {
  // anchorMin = (0.3969, 0.8821), anchorMax = (0.6031, 0.9494)
  //   top = (1 − 0.9494) × 100 = 5.06%
  left: '39.690%',
  width: '20.620%',
  top: '5.060%',
  height: '6.730%',
} as const;

function round(value: number, places = 4): string {
  return value.toFixed(places);
}

export function ParityHarness() {
  const { w, h, dpr } = useViewportSize();
  const scale = computeScaleFactor(w, h, REF);

  return (
    <div className={styles.root}>
      {/* Reference bounds — must land exactly on the window edges when the
          window aspect ratio matches the reference aspect ratio. */}
      <div className={styles.bounds} />
      <div className={styles.grid} />
      <div className={styles.crosshairV} />
      <div className={styles.crosshairH} />

      {/* Corner markers: 200×200, flush to each corner. */}
      <div className={`${styles.corner} ${styles.cornerTL}`} />
      <div className={`${styles.corner} ${styles.cornerTR}`} />
      <div className={`${styles.corner} ${styles.cornerBL}`} />
      <div className={`${styles.corner} ${styles.cornerBR}`} />

      <div className={styles.probeB} style={BACK_BUTTON}>
        BackButton 124²
      </div>

      <div className={styles.probeA} style={START_BUTTON}>
        StartPuzzleButton
      </div>

      <div className={styles.probeA} style={APP_LOGO}>
        AppLogo
      </div>

      <dl className={styles.readout}>
        <dt>orientation</dt>
        <dd>{ORIENTATION}</dd>

        <dt>reference</dt>
        <dd>
          {REF.w} × {REF.h}
        </dd>

        <dt>window</dt>
        <dd>
          {w} × {h} @ dpr {dpr}
        </dd>

        <dt>scaleFactor</dt>
        <dd>{round(scale, 6)}</dd>

        <dt>canvas on screen</dt>
        <dd>
          {round(REF.w * scale, 2)} × {round(REF.h * scale, 2)} px
        </dd>

        <dt>BackButton on screen</dt>
        <dd>
          {round(124 * scale, 2)}² px @ x={round(40 * scale, 2)}
        </dd>

        <dt>1 reference px</dt>
        <dd>{round(scale, 6)} device px</dd>
      </dl>
    </div>
  );
}

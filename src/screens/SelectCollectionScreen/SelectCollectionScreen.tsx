import type { CSSProperties } from 'react';
import { COLLECTION_DEPARTMENTS, type CollectionDepartment } from '../../api/departments';
import { ORIENTATION, REF } from '../../canvas/reference';
import { COLLECTION_LAYOUT } from '../../layout/collection';
import { rectStyle, textStyle } from '../../layout/rect';
import styles from './SelectCollectionScreen.module.css';

/**
 * "Select The Collection" — six department tiles.
 *
 * Sits between ImageSelect and Browse: "Add from MAP's collection" opens this, and
 * picking a tile opens Browse with that department already filtering the grid. It
 * is the only route into Browse, which is why Back from Browse returns here rather
 * than skipping to ImageSelect (see `resolveBack`).
 *
 * Added by the client on 2026-08-04 from a 1920x1080 reference image. There is no
 * Unity scene for it — see the header of `layout/collection.ts`.
 */

const L = COLLECTION_LAYOUT[ORIENTATION];

/**
 * Height of one banner tile in reference px.
 *
 * The collage is drawn at `background-size: 100% auto`, so it is scaled to the
 * canvas WIDTH and its height follows the source aspect (1080x1920). The scroll
 * keyframe has to travel exactly this far for the loop to be seamless, and CSS
 * cannot work it out from a background image, so it is computed here and passed in
 * as a custom property.
 */
const BANNER_SOURCE_ASPECT = 1920 / 1080;
const BANNER_TILE_HEIGHT_PX = Math.round(REF.w * BANNER_SOURCE_ASPECT);

interface SelectCollectionScreenProps {
  readonly onBack: () => void;
  /** A tile was tapped — the caller opens Browse filtered to this department. */
  readonly onSelectDepartment: (department: CollectionDepartment) => void;
}

export function SelectCollectionScreen({
  onBack,
  onSelectDepartment,
}: SelectCollectionScreenProps) {
  return (
    <div className={styles.screen} style={rectStyle(L.screen.rect)}>
      <img className={styles.background} src={L.screen.background} alt="" draggable={false} />

      <div
        className={styles.banner}
        style={
          {
            backgroundImage: `url("${L.banner.sprite}")`,
            animationDuration: `${L.banner.scrollDurationMs}ms`,
            '--collage-tile-height': `${BANNER_TILE_HEIGHT_PX}px`,
          } as CSSProperties
        }
      />
      <div className={styles.scrim} style={{ background: L.banner.scrimColour }} />

      <img
        className={styles.logo}
        style={rectStyle(L.appLogo.rect)}
        src={L.appLogo.sprite}
        alt="Museum of Art & Photography"
        draggable={false}
      />

      <button
        type="button"
        className={styles.iconButton}
        style={rectStyle(L.backButton.rect)}
        onClick={onBack}
        aria-label="Back"
      >
        <img src={L.backButton.sprite} alt="" draggable={false} />
      </button>

      <div className={styles.title} style={{ ...rectStyle(L.title.rect), ...textStyle(L.title.text) }}>
        {L.title.text.text}
      </div>

      <div
        className={styles.grid}
        style={{
          ...rectStyle(L.grid.rect),
          gridTemplateColumns: `repeat(${L.grid.columns}, 1fr)`,
          gridTemplateRows: `repeat(${L.grid.rows}, 1fr)`,
          columnGap: `${L.grid.gapXPx}px`,
          rowGap: `${L.grid.gapYPx}px`,
        }}
      >
        {COLLECTION_DEPARTMENTS.map((department) => (
          <button
            key={department.id}
            type="button"
            className={styles.tile}
            style={{
              backgroundImage: `url("${department.tile}")`,
              borderRadius: `${L.grid.radiusPx}px`,
            }}
            onClick={() => onSelectDepartment(department)}
            aria-label={`Browse ${department.dept}`}
          >
            <span className={styles.tileLabel} style={textStyle(L.tileLabel)}>
              {department.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { cardImageUrl } from '../../api/imagekit';
import { primaryArtistName, type ResultsData } from '../../api/types';
import { ORIENTATION } from '../../canvas/reference';
import { BROWSE_LAYOUT } from '../../layout/screens';
import styles from './BrowseScreen.module.css';

const B = BROWSE_LAYOUT[ORIENTATION];

/**
 * One artwork card.
 *
 * The image is the 600 px ImageKit render, not `primary_image` — see
 * `src/api/imagekit.ts` for why. `loading="lazy"` plus `decoding="async"` means
 * off-screen cards in a 40-item page cost nothing until scrolled to, which
 * replaces Unity's manual download throttling and cancellation.
 *
 * Card INTERNAL geometry is not verified against Unity: the card prefab is not in
 * the repository. See the header note in src/layout/browse.ts.
 */

interface ArtworkCardProps {
  readonly item: ResultsData;
  readonly onSelect: (item: ResultsData) => void;
}

export function ArtworkCard({ item, onSelect }: ArtworkCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const artist = primaryArtistName(item);

  return (
    <button type="button" className={styles.card} onClick={() => onSelect(item)}>
      <span className={styles.cardImageBox}>
        {!failed ? (
          <img
            className={`${styles.cardImage} ${loaded ? styles.cardImageLoaded : ''}`}
            src={cardImageUrl(item.primary_image)}
            alt={item.title}
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        ) : null}

        {/* Spinner while loading; a static mark if the image never arrives. A
            broken thumbnail must not make the card unselectable. */}
        {!loaded && !failed ? <span className={styles.cardSpinner} aria-hidden="true" /> : null}
        {failed ? <span className={styles.cardImageFailed} aria-hidden="true" /> : null}
      </span>

      <span className={styles.cardCaption} style={{ height: `${B.card.captionHeightPx}px` }}>
        <span className={styles.cardTitle} style={{ fontSize: `${B.card.titleFontSizePx}px` }}>
          {item.title}
        </span>
        {artist ? (
          <span className={styles.cardMeta} style={{ fontSize: `${B.card.metaFontSizePx}px` }}>
            {artist}
          </span>
        ) : null}
        {item.accession_number ? (
          <span className={styles.cardMeta} style={{ fontSize: `${B.card.metaFontSizePx}px` }}>
            {item.accession_number}
          </span>
        ) : null}
      </span>
    </button>
  );
}

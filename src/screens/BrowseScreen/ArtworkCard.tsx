import { useState } from 'react';
import { thumbnailUrl } from '../../api/imagekit';
import type { ResultsData } from '../../api/types';
import styles from './BrowseScreen.module.css';

/**
 * One artwork card.
 *
 * The preview is the 600 px ImageKit render (low-res), NOT `primary_image` — see
 * `src/api/imagekit.ts` for why. It loads straight from the CDN via `<img>`
 * (HTTP/2 parallel loads); the full-resolution master is only fetched (and
 * cached) later, when the card is picked and the crop screen opens.
 *
 * FALLBACK: some artworks have no w600 render, so the preview URL 404s (or no
 * basename can be derived). Rather than show a broken card, fall back to the
 * full-resolution `primary_image` directly — heavier, but only for the few
 * items that lack a preview.
 */

interface ArtworkCardProps {
  readonly item: ResultsData;
  readonly onSelect: (item: ResultsData) => void;
}

export function ArtworkCard({ item, onSelect }: ArtworkCardProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [useFullRes, setUseFullRes] = useState(false);

  const thumb = thumbnailUrl(item.primary_image);
  // Prefer the low-res preview; use the master when there is no preview URL or
  // after the preview has failed to load.
  const src = !useFullRes && thumb ? thumb : item.primary_image;

  const handleError = () => {
    // Preview failed → try the full-res master once before giving up.
    if (!useFullRes && thumb && item.primary_image && item.primary_image !== thumb) {
      setLoaded(false);
      setUseFullRes(true);
      return;
    }
    setFailed(true);
  };

  return (
    <button type="button" className={styles.card} onClick={() => onSelect(item)}>
      <span className={styles.cardImageBox}>
        {src && !failed ? (
          <img
            className={`${styles.cardImage} ${loaded ? styles.cardImageLoaded : ''}`}
            src={src}
            alt={item.title}
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={handleError}
          />
        ) : null}

        {!loaded && !failed ? <div className={styles.cardSpinner} aria-hidden="true" /> : null}
        {failed ? <span className={styles.cardImageFailed} aria-hidden="true" /> : null}
      </span>
    </button>
  );
}

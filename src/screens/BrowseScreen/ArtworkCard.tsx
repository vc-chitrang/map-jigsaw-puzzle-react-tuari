import { useState } from 'react';
import { thumbnailUrl } from '../../api/imagekit';
import type { ResultsData } from '../../api/types';
import styles from './BrowseScreen.module.css';

/**
 * One artwork card.
 *
 * The preview is the 600 px ImageKit render (low-res), NOT `primary_image` — see
 * `src/api/imagekit.ts` for why. It is fetched through the Rust `image_fetch`
 * command, which caches it under app data: the first view of a page downloads
 * the previews, every later view reads them from disk. The full-resolution
 * master is loaded (also cached) only when the card is picked and the crop
 * screen opens. Each blob URL is revoked on unmount so a long browse session
 * does not leak memory.
 */

interface ArtworkCardProps {
  readonly item: ResultsData;
  readonly onSelect: (item: ResultsData) => void;
}

export function ArtworkCard({ item, onSelect }: ArtworkCardProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const thumb = thumbnailUrl(item.primary_image);

  return (
    <button type="button" className={styles.card} onClick={() => onSelect(item)}>
      <span className={styles.cardImageBox}>
        {thumb && !failed ? (
          <img
            className={`${styles.cardImage} ${loaded ? styles.cardImageLoaded : ''}`}
            src={thumb}
            alt={item.title}
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        ) : null}

        {!loaded && !failed ? <div className={styles.cardSpinner} aria-hidden="true" /> : null}
        {failed || !thumb ? <span className={styles.cardImageFailed} aria-hidden="true" /> : null}
      </span>
    </button>
  );
}

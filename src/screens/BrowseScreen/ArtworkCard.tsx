import { useEffect, useState } from 'react';
import { fetchImageAsBlobUrl } from '../../api/client';
import { thumbnailUrl } from '../../api/imagekit';
import { primaryArtistName, type ResultsData } from '../../api/types';
import { ORIENTATION } from '../../canvas/reference';
import { BROWSE_LAYOUT } from '../../layout/screens';
import styles from './BrowseScreen.module.css';

const B = BROWSE_LAYOUT[ORIENTATION];

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
 *
 * Card INTERNAL geometry is not verified against Unity: the card prefab is not in
 * the repository. See the header note in src/layout/browse.ts.
 */

interface ArtworkCardProps {
  readonly item: ResultsData;
  readonly onSelect: (item: ResultsData) => void;
}

export function ArtworkCard({ item, onSelect }: ArtworkCardProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const artist = primaryArtistName(item);

  useEffect(() => {
    const thumb = thumbnailUrl(item.primary_image);
    if (!thumb) {
      setFailed(true);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    setSrc(null);
    setFailed(false);

    fetchImageAsBlobUrl(thumb)
      .then((blob) => {
        if (cancelled) {
          URL.revokeObjectURL(blob);
          return;
        }
        objectUrl = blob;
        setSrc(blob);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.primary_image]);

  return (
    <button type="button" className={styles.card} onClick={() => onSelect(item)}>
      <span className={styles.cardImageBox}>
        {src && !failed ? (
          <img
            className={`${styles.cardImage} ${styles.cardImageLoaded}`}
            src={src}
            alt={item.title}
            decoding="async"
            draggable={false}
            onError={() => setFailed(true)}
          />
        ) : null}

        {/* Spinner while the cached fetch is in flight; a static mark if the
            image never arrives. A broken thumbnail must not make the card
            unselectable. */}
        {!src && !failed ? <span className={styles.cardSpinner} aria-hidden="true" /> : null}
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

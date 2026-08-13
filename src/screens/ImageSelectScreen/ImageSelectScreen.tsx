import { useEffect, useState } from 'react';
import { ORIENTATION } from '../../canvas/reference';
import { IMAGE_SELECT_LAYOUT } from '../../layout/screens';
import { rectStyle, textStyle } from '../../layout/rect';
import { buildUploadUrl, generateQrDataUrl } from '../../api/qr';
import styles from './ImageSelectScreen.module.css';

/**
 * Image Select / Upload — the fork between browsing the collection and uploading
 * a photo from a phone.
 *
 * Two choices either side of a divider: in portrait they are two 682² squares
 * stacked vertically, in landscape two fractional panels side by side. The QR
 * is generated per kiosk from `kioskToken` + `uploadBaseUrl` (see `api/qr.ts`);
 * the phone-side upload page is a separate service, and the kiosk learns about
 * the result over the `new-upload` socket event rather than by polling.
 *
 * The instruction line changes PARENT between orientations — panel in portrait,
 * screen in landscape — so it is rendered from `descriptionParent` rather than
 * from an assumption (see `layout/screens.ts`).
 */

const S = IMAGE_SELECT_LAYOUT[ORIENTATION];

interface ImageSelectScreenProps {
  readonly onBack: () => void;
  readonly onBrowseCollection: () => void;
  /**
   * Accepted for call-site compatibility but no longer used: the QR is always
   * shown clean, with no offline/dimmed state (per design correction).
   */
  readonly uploadReady?: boolean;
  /** `null` until resolved; the QR does not render until this is available. */
  readonly kioskToken: string | null;
  /** From `getPublicConfig().uploadUrl`. Empty when the upload feature is not
   *  configured server-side — the QR does not render in that case either. */
  readonly uploadBaseUrl: string;
}

export function ImageSelectScreen({
  onBack,
  onBrowseCollection,
  kioskToken,
  uploadBaseUrl,
}: ImageSelectScreenProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!kioskToken || !uploadBaseUrl) {
      setQrDataUrl(null);
      return;
    }

    let disposed = false;
    const url = buildUploadUrl(uploadBaseUrl, kioskToken);
    void generateQrDataUrl(url)
      .then((dataUrl) => {
        if (!disposed) setQrDataUrl(dataUrl);
      })
      .catch((error) => {
        console.error('[image-select] could not generate the upload QR', error);
      });

    return () => {
      disposed = true;
    };
  }, [kioskToken, uploadBaseUrl]);

  const description = (
    <span
      className={styles.description}
      style={{ ...rectStyle(S.descriptionRect), ...textStyle(S.description) }}
    >
      {S.description.text}
    </span>
  );

  return (
    <div className={styles.screen} style={rectStyle(S.screen.rect)}>
      <img className={styles.background} src={S.screen.background} alt="" draggable={false} />

      <img
        className={styles.logo}
        style={rectStyle(S.appLogo.rect)}
        src={S.appLogo.sprite}
        alt="Museum of Art & Photography"
        draggable={false}
      />

      <button
        type="button"
        className={styles.iconButton}
        style={rectStyle(S.backButton.rect)}
        onClick={onBack}
        aria-label="Back"
      >
        <img src={S.backButton.sprite} alt="" draggable={false} />
      </button>

      {S.descriptionParent === 'screen' ? description : null}

      <div
        className={styles.panel}
        style={{ ...rectStyle(S.panelRect), background: S.panelBackground }}
      >
        {S.descriptionParent === 'panel' ? description : null}

        {/* ---- Collection ---- */}
        <button
          type="button"
          className={styles.choice}
          style={{
            ...rectStyle(S.collectionButton.rect),
            background: S.collectionButton.background,
          }}
          onClick={onBrowseCollection}
          aria-label="Add from MAP's collection"
        >
          <img
            className={styles.choiceIcon}
            style={rectStyle(S.collectionButton.iconRect)}
            src={S.collectionButton.iconSprite}
            alt=""
            draggable={false}
          />
          <span
            className={styles.choiceLabel}
            style={{ ...rectStyle(S.collectionButton.labelRect), ...textStyle(S.collectionButton.label) }}
          >
            {S.collectionButton.label.text}
          </span>
        </button>

        <span
          className={styles.choiceCaption}
          style={{
            ...rectStyle(S.collectionButton.rect),
            // The caption belongs to the button but must not be inside it: a
            // <button> may not contain the absolutely-positioned band that sits
            // above its own top edge.
            pointerEvents: 'none',
            background: 'none',
          }}
        >
          <span
            className={styles.captionText}
            style={{ ...rectStyle(S.collectionButton.captionRect), ...textStyle(S.collectionButton.caption) }}
          >
            {S.collectionButton.caption.text}
          </span>
        </span>

        <img className={styles.divider} style={rectStyle(S.dividerRect)} src={S.dividerSprite} alt="" draggable={false} />

        {/* ---- QR upload ----
            Generated per kiosk (see the effect above); it renders black-on-white
            directly onto `.qrCode`'s own white rounded background. No circular
            pill and no offline/dimmed treatment: the code is always shown clean.
            Until the token/base URL resolve, the plain `<div>` fallback keeps that
            same white square visible instead of a broken-image icon. */}
        <div className={styles.qrPanel} style={rectStyle(S.qrPanel.rect)}>
          {qrDataUrl ? (
            <img
              className={styles.qrCode}
              style={rectStyle(S.qrPanel.codeRect)}
              src={qrDataUrl}
              alt="QR code to upload your own image"
              draggable={false}
            />
          ) : (
            <div className={styles.qrCode} style={rectStyle(S.qrPanel.codeRect)} />
          )}
          <span
            className={styles.captionText}
            style={{ ...rectStyle(S.qrPanel.captionRect), ...textStyle(S.qrPanel.caption) }}
          >
            {S.qrPanel.caption.text}
          </span>
        </div>
      </div>
    </div>
  );
}

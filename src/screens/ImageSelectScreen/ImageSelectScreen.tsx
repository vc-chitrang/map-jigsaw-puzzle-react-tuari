import { ORIENTATION } from '../../canvas/reference';
import { IMAGE_SELECT_LAYOUT } from '../../layout/screens';
import { rectStyle, textStyle } from '../../layout/rect';
import styles from './ImageSelectScreen.module.css';

/**
 * Image Select / Upload — the fork between browsing the collection and uploading
 * a photo from a phone.
 *
 * Two choices either side of a divider: in portrait they are two 682² squares
 * stacked vertically, in landscape two fractional panels side by side. The QR
 * itself is a STATIC bundled sprite (`QR_Code_1-1024.png`); the phone-side upload
 * page is a separate service, and the kiosk learns about the result over the
 * `new-upload` socket event rather than by generating a code.
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
}

export function ImageSelectScreen({ onBack, onBrowseCollection }: ImageSelectScreenProps) {
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
            The QR sprite is black-on-transparent, so it renders on its own plain
            white square (`.qrCode` background). No circular pill and no
            offline/dimmed treatment: the code is always shown clean. */}
        <div className={styles.qrPanel} style={rectStyle(S.qrPanel.rect)}>
          <img
            className={styles.qrCode}
            style={rectStyle(S.qrPanel.codeRect)}
            src={S.qrPanel.codeSprite}
            alt="QR code to upload your own image"
            draggable={false}
          />
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

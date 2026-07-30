import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ScaledCanvas } from './canvas/ScaledCanvas';
import { ParityHarness } from './dev/ParityHarness';
import { PuzzleScreen } from './screens/PuzzleScreen/PuzzleScreen';
import { BrowseScreen } from './screens/BrowseScreen/BrowseScreen';
import { ImageSelectScreen } from './screens/ImageSelectScreen/ImageSelectScreen';
import { CropScreen } from './screens/CropScreen/CropScreen';
import { ScreenRouter } from './navigation/ScreenRouter';
import {
  INITIAL_NAV_STATE,
  isTransitioning,
  navReducer,
  resolveBack,
  type ScreenId,
} from './navigation/router';
import { VersionBadge } from './ui/VersionBadge';
import { fetchImageAsBlobUrl } from './api/client';
import { connectUploadSocket, type UploadSocket } from './api/socket';
import type { ResultsData } from './api/types';

/**
 * Application shell.
 *
 * Navigation goes through `ScreenRouter`, which cross-fades through black and
 * whose overlay can never be left blocking input (ADR-002). All rules live in
 * `navigation/router.ts`; this component wires them to the screens and owns the
 * things that outlive a screen: the pending crop image and the upload socket.
 *
 * Flow: Puzzle → ImageSelect → Browse → Crop → Puzzle, with a QR upload able to
 * jump straight to Crop from either ImageSelect or Crop itself.
 */

/** An image waiting to be cropped, plus the title to carry forward. */
interface CropSource {
  readonly url: string;
  readonly title: string;
}

export function App() {
  const showHarness = import.meta.env.VITE_PARITY_HARNESS === '1';

  const [nav, dispatchNav] = useReducer(navReducer, INITIAL_NAV_STATE);
  const [cropSource, setCropSource] = useState<CropSource | null>(null);
  const [preparedArtwork, setPreparedArtwork] = useState<CropSource | null>(null);
  const [uploadReady, setUploadReady] = useState(false);
  /** Bumped to force the Puzzle screen back to attract mode with a new artwork. */
  const [resetToken, setResetToken] = useState(0);
  /** Set by the Puzzle screen so the Back rule can tell attract from mid-game. */
  const puzzleMidGame = useRef(false);

  /**
   * Current screen, readable from the socket callback without making the socket
   * effect depend on it — re-subscribing on every navigation would drop an upload
   * that arrives mid-transition.
   */
  const screenRef = useRef<ScreenId>(nav.current);
  screenRef.current = nav.current;

  const go = useCallback((to: ScreenId) => dispatchNav({ type: 'NAVIGATE', to }), []);

  /** Revoked whenever it is replaced, so browsing cannot leak blob URLs. */
  const cropSourceRef = useRef<CropSource | null>(null);

  const replaceCropSource = useCallback((next: CropSource | null) => {
    const previous = cropSourceRef.current;
    if (previous && previous.url !== next?.url && previous.url.startsWith('blob:')) {
      URL.revokeObjectURL(previous.url);
    }
    cropSourceRef.current = next;
    setCropSource(next);
  }, []);

  /**
   * The cropped square, owned HERE for the same reason as `cropSource`.
   *
   * The Puzzle screen used to take ownership and revoke on unmount, which broke
   * two flows: START then Back remounted the screen with a URL it had already
   * revoked (a black board), and StrictMode's mount-cleanup-mount cycle revoked it
   * before the first paint. The creator revokes; the screen only reads.
   */
  const preparedArtworkRef = useRef<CropSource | null>(null);

  const replacePreparedArtwork = useCallback((next: CropSource | null) => {
    const previous = preparedArtworkRef.current;
    if (previous && previous.url !== next?.url && previous.url.startsWith('blob:')) {
      URL.revokeObjectURL(previous.url);
    }
    preparedArtworkRef.current = next;
    setPreparedArtwork(next);
  }, []);

  /**
   * Load an image for cropping through the Rust `image_fetch` command.
   *
   * Not via `<img src>`: the crop canvas reads pixels back, and a cross-origin
   * image without CORS headers taints the canvas so `toBlob()` throws.
   */
  const openCropWith = useCallback(
    async (imageUrl: string, title: string) => {
      try {
        const blobUrl = await fetchImageAsBlobUrl(imageUrl);
        replaceCropSource({ url: blobUrl, title });
        dispatchNav({ type: 'NAVIGATE', to: 'crop' });
      } catch (error) {
        // Staying put is the right failure mode: the visitor keeps the screen they
        // were on rather than landing on an empty crop stage.
        console.error('[app] could not load the image for cropping', error);
      }
    },
    [replaceCropSource],
  );

  // ---- QR upload socket ----------------------------------------------------
  useEffect(() => {
    let socket: UploadSocket | null = null;
    let disposed = false;

    void (async () => {
      const connection = await connectUploadSocket({
        onStatus: setUploadReady,
        onImageUrl: (url) => {
          // Accept an upload ONLY while ImageSelect or Crop is showing
          // (UIManager.OnImageReceived). That is what lets a visitor scan a
          // second QR while already cropping and replace the image in place, and
          // what stops an upload hijacking a game in progress.
          const current = screenRef.current;
          if (current !== 'select' && current !== 'crop') {
            console.info(`[app] ignoring an upload while on the ${current} screen`);
            return;
          }
          // A QR upload has no artwork title.
          void openCropWith(url, '');
        },
      });

      if (disposed) {
        connection?.disconnect();
        return;
      }
      socket = connection;
    })();

    return () => {
      disposed = true;
      socket?.disconnect();
    };
  }, [openCropWith]);

  // Release both owned blob URLs when the app goes away.
  useEffect(
    () => () => {
      for (const owned of [cropSourceRef.current, preparedArtworkRef.current]) {
        if (owned?.url.startsWith('blob:')) URL.revokeObjectURL(owned.url);
      }
    },
    [],
  );

  const handleSelectArtwork = useCallback(
    (item: ResultsData) => void openCropWith(item.primary_image, item.title ?? ''),
    [openCropWith],
  );

  const handleCropped = useCallback(
    (result: CropSource) => {
      // Both blobs are ours: the source is finished with, the cropped square is
      // handed to the Puzzle screen to READ and released here when it is replaced.
      replaceCropSource(null);
      replacePreparedArtwork(result);
      dispatchNav({ type: 'NAVIGATE', to: 'puzzle' });
    },
    [replaceCropSource, replacePreparedArtwork],
  );

  /** Play Again needs a fresh random artwork, so the cropped one must be dropped. */
  const handlePlayAgain = useCallback(() => replacePreparedArtwork(null), [replacePreparedArtwork]);

  /**
   * Back / Home, following the custom rules in `resolveBack`.
   *
   * `quit` is the same exit the staff gesture uses. It only happens from the
   * Puzzle screen in attract mode, which is exactly Unity's rule.
   */
  const handleBack = useCallback(() => {
    const outcome = resolveBack(nav, { puzzleMidGame: puzzleMidGame.current });

    switch (outcome.kind) {
      case 'navigate':
        if (outcome.resetToLaunch) {
          replaceCropSource(null);
          replacePreparedArtwork(null);
          // The token is what actually resets the game. Clearing `preparedArtwork`
          // alone is not enough: if it was already null nothing changes and the
          // Puzzle screen would stay mid-game.
          setResetToken((token) => token + 1);
        }
        dispatchNav({ type: 'NAVIGATE', to: outcome.to });
        return;

      case 'resetToLaunch':
        replaceCropSource(null);
        replacePreparedArtwork(null);
        setResetToken((token) => token + 1);
        return;

      case 'quit':
        if ('__TAURI_INTERNALS__' in window) {
          void getCurrentWindow()
            .close()
            .catch((error) => console.error('[app] quit failed', error));
        } else {
          console.info('[app] quit requested (no-op outside Tauri)');
        }
        return;

      default: {
        const unreachable: never = outcome;
        return unreachable;
      }
    }
  }, [nav, replaceCropSource, replacePreparedArtwork]);

  if (showHarness) {
    return (
      <>
        <ScaledCanvas>
          <ParityHarness />
        </ScaledCanvas>
        <VersionBadge />
      </>
    );
  }

  // While a transition runs, the overlay covers everything, so the outgoing
  // screen cannot be interacted with regardless of what it renders.
  const blocked = isTransitioning(nav);

  const screen =
    nav.current === 'select' ? (
      <ImageSelectScreen
        onBack={handleBack}
        onBrowseCollection={() => go('browse')}
        uploadReady={uploadReady}
      />
    ) : nav.current === 'browse' ? (
      <BrowseScreen onBack={handleBack} onSelectArtwork={handleSelectArtwork} />
    ) : nav.current === 'crop' && cropSource ? (
      <CropScreen
        imageUrl={cropSource.url}
        title={cropSource.title}
        onBack={handleBack}
        onCropped={handleCropped}
      />
    ) : (
      <PuzzleScreen
        preparedArtwork={preparedArtwork}
        onStart={() => go('select')}
        onHome={handleBack}
        onPlayAgain={handlePlayAgain}
        resetToken={resetToken}
        onMidGameChange={(midGame) => {
          puzzleMidGame.current = midGame;
        }}
      />
    );

  return (
    <>
      <ScreenRouter state={nav} dispatch={dispatchNav}>
        <ScaledCanvas>{screen}</ScaledCanvas>
      </ScreenRouter>
      <VersionBadge />
      {/* Debug aid: the phase is on the overlay's data-phase attribute, and this
          mirrors it for the parity harness / DOM assertions. */}
      <span hidden data-nav-phase={nav.phase} data-nav-screen={nav.current} data-blocked={blocked} />
    </>
  );
}

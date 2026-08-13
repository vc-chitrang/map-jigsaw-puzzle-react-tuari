import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ScaledCanvas } from './canvas/ScaledCanvas';
import { ParityHarness } from './dev/ParityHarness';
import { PuzzleScreen } from './screens/PuzzleScreen/PuzzleScreen';
import { BrowseScreen } from './screens/BrowseScreen/BrowseScreen';
import { ImageSelectScreen } from './screens/ImageSelectScreen/ImageSelectScreen';
import { SelectCollectionScreen } from './screens/SelectCollectionScreen/SelectCollectionScreen';
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
import { KioskTokenBadge } from './ui/KioskTokenBadge';
import { LoadingOverlay } from './ui/LoadingOverlay';
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
  /**
   * Department chosen on "Select The Collection", used as Browse's opening filter.
   *
   * Browse unmounts whenever the router leaves it, so a new choice arrives as a
   * fresh mount and `useCollection` picks it up as its initial selection — no need
   * to push the change into a live Browse screen.
   */
  const [selectedDepartment, setSelectedDepartment] = useState<number | undefined>(undefined);
  /** True while a full-resolution master is downloading, before Crop can open. */
  const [preparingCrop, setPreparingCrop] = useState(false);
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
      // `primary_image` is a 4-7 MB master, so this can take seconds on a cold
      // cache. Without the scrim the visitor taps a card and NOTHING happens, so
      // they tap again — the overlay is the feedback and it also swallows those
      // repeat taps.
      setPreparingCrop(true);
      try {
        const blobUrl = await fetchImageAsBlobUrl(imageUrl);
        replaceCropSource({ url: blobUrl, title });
        dispatchNav({ type: 'NAVIGATE', to: 'crop' });
      } catch (error) {
        // Staying put is the right failure mode: the visitor keeps the screen they
        // were on rather than landing on an empty crop stage.
        console.error('[app] could not load the image for cropping', error);
      } finally {
        // Cleared even on failure, or a dead network would leave a permanent scrim
        // with no way back.
        setPreparingCrop(false);
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

  /*
   * There is no `onPlayAgain` any more.
   *
   * It used to clear `preparedArtwork` so Play Again would load a fresh artwork.
   * The client specified the opposite (2026-07-31): Play Again re-shuffles the
   * artwork just played. Clearing it here would REVOKE the very blob URL the board
   * is still slicing, so the puzzle would go black — the Puzzle screen now handles
   * Play Again entirely on its own and `App` is not involved.
   */

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
        // "Add from MAP's collection" now opens the department chooser rather than
        // Browse directly (client, 2026-08-04).
        onBrowseCollection={() => go('collection')}
        uploadReady={uploadReady}
      />
    ) : nav.current === 'collection' ? (
      <SelectCollectionScreen
        onBack={handleBack}
        onSelectDepartment={(department) => {
          setSelectedDepartment(department.id);
          go('browse');
        }}
      />
    ) : nav.current === 'browse' ? (
      <BrowseScreen
        onBack={handleBack}
        initialDepartment={selectedDepartment}
        onSelectArtwork={handleSelectArtwork}
      />
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
        onNewImage={() => go('select')}
        onHome={handleBack}
        resetToken={resetToken}
        onMidGameChange={(midGame) => {
          puzzleMidGame.current = midGame;
        }}
      />
    );

  return (
    <>
      <ScreenRouter state={nav} dispatch={dispatchNav}>
        <ScaledCanvas>
          {screen}
          {/* Inside the canvas so it scales with everything else, and `elevated`
              so it also covers the Browse screen's dropdown popups and keyboard. */}
          {preparingCrop ? <LoadingOverlay label="Loading the artwork..." elevated /> : null}
        </ScaledCanvas>
      </ScreenRouter>
      <VersionBadge />
      <KioskTokenBadge />
      {/* Debug aid: the phase is on the overlay's data-phase attribute, and this
          mirrors it for the parity harness / DOM assertions. */}
      <span hidden data-nav-phase={nav.phase} data-nav-screen={nav.current} data-blocked={blocked} />
    </>
  );
}

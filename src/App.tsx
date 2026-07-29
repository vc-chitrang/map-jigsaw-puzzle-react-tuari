import { useCallback, useEffect, useRef, useState } from 'react';
import { ScaledCanvas } from './canvas/ScaledCanvas';
import { ParityHarness } from './dev/ParityHarness';
import { PuzzleScreen } from './screens/PuzzleScreen/PuzzleScreen';
import { BrowseScreen } from './screens/BrowseScreen/BrowseScreen';
import { ImageSelectScreen } from './screens/ImageSelectScreen/ImageSelectScreen';
import { CropScreen } from './screens/CropScreen/CropScreen';
import { VersionBadge } from './ui/VersionBadge';
import { fetchImageAsBlobUrl } from './api/client';
import { connectUploadSocket, type UploadSocket } from './api/socket';
import type { ResultsData } from './api/types';

/**
 * Application shell.
 *
 * INTERIM NAVIGATION — replaced in Phase 5 by `ScreenRouter`.
 *
 * A plain state switch: no cross-fade, no back stack. Phase 5 adds the real router
 * with the `idle | fadingOut | fadingIn` transition state, the timeout fallback and
 * the custom back rules (ADR-002, game-logic §6.3). Deliberately NOT half-building
 * the overlay here — a partial version of the exact mechanism that wedged the Unity
 * build is worse than none.
 *
 * Flow: Puzzle -> ImageSelect -> Browse -> Crop -> Puzzle, with a QR upload able to
 * jump straight to Crop.
 */

type Screen = 'puzzle' | 'select' | 'browse' | 'crop';

/** An image waiting to be cropped, plus the title to carry forward. */
interface CropSource {
  readonly url: string;
  readonly title: string;
}

export function App() {
  const showHarness = import.meta.env.VITE_PARITY_HARNESS === '1';

  const [screen, setScreen] = useState<Screen>('puzzle');
  const [cropSource, setCropSource] = useState<CropSource | null>(null);
  const [preparedArtwork, setPreparedArtwork] = useState<CropSource | null>(null);
  const [uploadReady, setUploadReady] = useState(false);

  /**
   * The current screen, readable from the socket callback without making the
   * socket effect depend on it — re-subscribing on every navigation would drop
   * uploads that arrive mid-transition.
   */
  const screenRef = useRef<Screen>(screen);
  screenRef.current = screen;

  /** Revoked whenever it is replaced, so a browsing visitor cannot leak blobs. */
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
        setScreen('crop');
      } catch (error) {
        // Staying put is the right failure mode: the visitor keeps whatever screen
        // they were on rather than landing on an empty crop stage.
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
          // (UIManager.OnImageReceived). This is what lets a visitor scan a
          // second QR while already cropping and replace the image in place,
          // and what stops an upload from hijacking a game in progress.
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

  // Release the pending crop image when the app goes away.
  useEffect(
    () => () => {
      const pending = cropSourceRef.current;
      if (pending?.url.startsWith('blob:')) URL.revokeObjectURL(pending.url);
    },
    [],
  );

  const handleSelectArtwork = useCallback(
    (item: ResultsData) => void openCropWith(item.primary_image, item.title ?? ''),
    [openCropWith],
  );

  const handleCropped = useCallback(
    (result: CropSource) => {
      // The Puzzle screen takes ownership of the cropped blob; the SOURCE image is
      // ours to release.
      replaceCropSource(null);
      setPreparedArtwork(result);
      setScreen('puzzle');
    },
    [replaceCropSource],
  );

  const goHome = useCallback(() => {
    replaceCropSource(null);
    setPreparedArtwork(null);
    setScreen('puzzle');
  }, [replaceCropSource]);

  return (
    <>
      <ScaledCanvas>
        {showHarness ? (
          <ParityHarness />
        ) : screen === 'select' ? (
          <ImageSelectScreen
            onBack={goHome}
            onBrowseCollection={() => setScreen('browse')}
            uploadReady={uploadReady}
          />
        ) : screen === 'browse' ? (
          <BrowseScreen onBack={() => setScreen('select')} onSelectArtwork={handleSelectArtwork} />
        ) : screen === 'crop' && cropSource ? (
          <CropScreen
            imageUrl={cropSource.url}
            title={cropSource.title}
            // Back from Crop returns to Browse when that is where it came from,
            // else to ImageSelect (game-logic §6.3). A QR upload has no title and
            // no Browse history, so it goes back to ImageSelect.
            onBack={() => setScreen(cropSource.title ? 'browse' : 'select')}
            onCropped={handleCropped}
          />
        ) : (
          <PuzzleScreen
            preparedArtwork={preparedArtwork}
            onStart={() => setScreen('select')}
            onHome={goHome}
          />
        )}
      </ScaledCanvas>
      <VersionBadge />
    </>
  );
}

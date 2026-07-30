import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ORIENTATION, REF } from '../../canvas/reference';
import { CROP_LAYOUT } from '../../layout/screens';
import { rectStyle, textStyle } from '../../layout/rect';
import { SpriteButton } from '../../ui/SpriteButton';
import {
  CORNER_COUNT,
  cornerPosition,
  fittedImageRect,
  gridBounds,
  initialGrid,
  moveGrid,
  normaliseRotation,
  resizeGridFromCorner,
  type CornerIndex,
  type Rect,
  type Rotation,
} from '../../image/cropGrid';
import { exportCrop } from '../../image/exportCrop';
import styles from './CropScreen.module.css';

/**
 * Crop screen.
 *
 * The image is displayed fitted and does NOT pan or zoom. A square grid over it is
 * resized by four corner handles and moved by dragging its body, always clamped
 * inside the visible image — this is `CropGridResizer`, and it is what the scene
 * actually wires up. The zoom slider and reset button that
 * docs/game-logic.md §10 describes live under an INACTIVE parent and do not ship
 * (ADR-017).
 *
 * Rotation is ±90° over 300 ms linear, and the pixel rotation is committed after
 * the tween — the board slices with `background-position`, which cannot carry a
 * rotation.
 *
 * The instruction line changes PARENT between orientations: portrait anchors it
 * above the stage (`anchorY > 1` inside `CropAreaBackground`), landscape hangs it
 * from the screen's top edge. `descriptionParent` decides, so neither case is an
 * assumption (see `layout/screens.ts`).
 */

const ROTATE_MS = 300;

const C = CROP_LAYOUT[ORIENTATION];

interface CropScreenProps {
  /** Square-cropping is this screen's job, so any aspect ratio is fine here. */
  readonly imageUrl: string;
  /** Artwork title, carried through to the high-score key. Empty for QR uploads. */
  readonly title?: string;
  readonly onBack: () => void;
  readonly onCropped: (result: { url: string; title: string }) => void;
}

/** Stage size in reference px, derived from the layout table. */
function stageSize(): { width: number; height: number } {
  const rect = C.stageRect;
  return {
    width: (rect.anchorMax.x - rect.anchorMin.x) * REF.w,
    height: (rect.anchorMax.y - rect.anchorMin.y) * REF.h,
  };
}

interface DragState {
  readonly pointerId: number;
  /** null = moving the grid body; otherwise the corner being resized. */
  readonly corner: CornerIndex | null;
  readonly lastX: number;
  readonly lastY: number;
}

export function CropScreen({ imageUrl, title = '', onBack, onCropped }: CropScreenProps) {
  const stage = useMemo(stageSize, []);

  const [source, setSource] = useState<{ width: number; height: number } | null>(null);
  const [rotation, setRotation] = useState<Rotation>(0);
  /** Non-zero while the rotate tween is running. */
  const [rotatingBy, setRotatingBy] = useState(0);
  const [grid, setGrid] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragState | null>(null);

  const visible = useMemo(
    () => (source ? fittedImageRect(stage, source, rotation) : null),
    [stage, source, rotation],
  );
  const bounds = useMemo(
    () => (visible ? gridBounds(visible, C.minSizeFraction) : null),
    [visible],
  );

  // Load the image to learn its intrinsic size; the fit and the grid follow.
  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (cancelled) return;
      setSource({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => console.error('[crop] could not load the image to crop');
    image.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  // Re-centre the grid whenever the fit changes — a new image or a rotation.
  useEffect(() => {
    if (!visible || visible.width === 0) return;
    setGrid(initialGrid(visible, C.minSizeFraction));
  }, [visible]);

  /** Convert a client-space delta to reference px. */
  const toReference = useCallback((deltaPx: number): number => {
    const element = stageRef.current;
    if (!element) return deltaPx;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0) return deltaPx;
    // The whole UI is inside one uniform transform, so one ratio covers both axes.
    return deltaPx * (stage.width / rect.width);
  }, [stage.width]);

  const beginDrag = useCallback(
    (event: React.PointerEvent, corner: CornerIndex | null) => {
      if (busy) return;
      event.stopPropagation();

      // Capture keeps the drag alive when the finger leaves the handle. It can
      // throw (NotFoundError) if the pointer is already gone; dragging must still
      // work in that case, so this is best-effort rather than a precondition.
      try {
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      } catch {
        /* fall through to the un-captured path */
      }

      drag.current = {
        pointerId: event.pointerId,
        corner,
        lastX: event.clientX,
        lastY: event.clientY,
      };
    },
    [busy],
  );

  const continueDrag = useCallback(
    (event: React.PointerEvent) => {
      const active = drag.current;
      if (!active || active.pointerId !== event.pointerId) return;
      if (!visible || !bounds) return;

      const deltaX = toReference(event.clientX - active.lastX);
      const deltaY = toReference(event.clientY - active.lastY);
      drag.current = { ...active, lastX: event.clientX, lastY: event.clientY };

      setGrid((current) => {
        if (!current) return current;
        return active.corner === null
          ? moveGrid(current, deltaX, deltaY, visible)
          : resizeGridFromCorner(current, active.corner, deltaX, deltaY, visible, bounds);
      });
    },
    [bounds, toReference, visible],
  );

  const endDrag = useCallback((event: React.PointerEvent) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }, []);

  const rotate = useCallback(
    (degrees: 90 | -90) => {
      if (busy || rotatingBy !== 0) return;
      setRotatingBy(degrees);
      // Commit the pixel rotation only after the visual tween, as Unity does.
      window.setTimeout(() => {
        setRotation((current) => normaliseRotation(current + degrees));
        setRotatingBy(0);
      }, ROTATE_MS);
    },
    [busy, rotatingBy],
  );

  const handleStart = useCallback(() => {
    if (!grid || !visible || busy) return;
    setBusy(true);

    void (async () => {
      try {
        const result = await exportCrop(imageUrl, grid, visible, rotation);
        onCropped({ url: result.url, title });
      } catch (error) {
        console.error('[crop] export failed', error);
        setBusy(false);
      }
    })();
  }, [busy, grid, imageUrl, onCropped, rotation, title, visible]);

  const ready = grid !== null && visible !== null && visible.width > 0;

  const description = (
    <span
      className={styles.description}
      style={{ ...rectStyle(C.descriptionRect), ...textStyle(C.description) }}
    >
      {C.description.text}
    </span>
  );

  return (
    <div className={styles.screen} style={rectStyle(C.screen.rect)}>
      <img className={styles.background} src={C.screen.background} alt="" draggable={false} />

      <img
        className={styles.logo}
        style={rectStyle(C.appLogo.rect)}
        src={C.appLogo.sprite}
        alt="Museum of Art & Photography"
        draggable={false}
      />

      <button
        type="button"
        className={styles.iconButton}
        style={rectStyle(C.backButton.rect)}
        onClick={onBack}
        aria-label="Back"
      >
        <img src={C.backButton.sprite} alt="" draggable={false} />
      </button>

      {C.descriptionParent === 'screen' ? description : null}

      <div
        className={styles.stage}
        style={{ ...rectStyle(C.stageRect), background: C.stageBackground }}
        ref={stageRef}
      >
        {C.descriptionParent === 'stage' ? description : null}

        {/* Square wrapper so a 90° turn about its centre stays in place. The
            tween runs on this; the committed rotation re-fits the image. */}
        <div
          className={styles.rotator}
          style={{
            transform: `rotate(${rotatingBy}deg)`,
            transition: rotatingBy === 0 ? 'none' : `transform ${ROTATE_MS}ms linear`,
          }}
        >
          <img
            className={styles.image}
            src={imageUrl}
            alt=""
            draggable={false}
            style={{ transform: `rotate(${rotation}deg)` }}
          />
        </div>

        {ready ? (
          <>
            {/* Dimmed surround, so the selected square reads as the selection. */}
            <div className={styles.scrim} style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${grid.x}px ${grid.y}px, ${grid.x}px ${grid.y + grid.height}px, ${grid.x + grid.width}px ${grid.y + grid.height}px, ${grid.x + grid.width}px ${grid.y}px, ${grid.x}px ${grid.y}px)` }} />

            <div
              className={styles.grid}
              style={{
                left: `${grid.x}px`,
                top: `${grid.y}px`,
                width: `${grid.width}px`,
                height: `${grid.height}px`,
                backgroundImage: `url("${C.gridSprite}")`,
              }}
              onPointerDown={(event) => beginDrag(event, null)}
              onPointerMove={continueDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              role="presentation"
            >
              {Array.from({ length: CORNER_COUNT }, (_, index) => {
                const corner = index as CornerIndex;
                const position = cornerPosition(grid, corner);
                return (
                  <div
                    key={corner}
                    className={styles.handle}
                    style={{
                      width: `${C.handleSizePx}px`,
                      height: `${C.handleSizePx}px`,
                      background: C.handleColour,
                      // Positions are stage-space; the grid is the offset parent.
                      left: `${position.x - grid.x - C.handleSizePx / 2}px`,
                      top: `${position.y - grid.y - C.handleSizePx / 2}px`,
                    }}
                    onPointerDown={(event) => beginDrag(event, corner)}
                    onPointerMove={continueDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    role="presentation"
                  />
                );
              })}
            </div>
          </>
        ) : null}

        {/* Rotate buttons, below the stage. */}
        {(
          [
            { key: 'anticlockwise', posX: C.rotateButtons.anticlockwisePosX, degrees: -90 as const, flip: false },
            { key: 'clockwise', posX: C.rotateButtons.clockwisePosX, degrees: 90 as const, flip: true },
          ]
        ).map((button) => (
          <button
            key={button.key}
            type="button"
            className={styles.rotateButton}
            style={{
              ...rectStyle({
                kind: 'point',
                anchor: { x: 0.5, y: 0 },
                pos: { x: button.posX, y: C.rotateButtons.posY },
                size: C.rotateButtons.size,
                pivot: { x: 0.5, y: 0 },
              }),
              background: C.rotateButtons.background,
            }}
            onClick={() => rotate(button.degrees)}
            disabled={busy}
            aria-label={button.key === 'clockwise' ? 'Rotate clockwise' : 'Rotate anticlockwise'}
          >
            <img
              className={styles.rotateIcon}
              src={C.rotateButtons.iconSprite}
              alt=""
              draggable={false}
              style={{
                inset: `${C.rotateButtons.iconInsetPx}px`,
                // Explicit size: an <img> with `width: auto` takes its intrinsic
                // size and ignores the right/bottom insets.
                width: `${C.rotateButtons.size.x - C.rotateButtons.iconInsetPx * 2}px`,
                height: `${C.rotateButtons.size.y - C.rotateButtons.iconInsetPx * 2}px`,
                // Unity mirrors the same sprite with scale.x = −1 for clockwise.
                transform: button.flip ? 'scaleX(-1)' : 'none',
              }}
            />
          </button>
        ))}
      </div>

      <SpriteButton
        rect={C.startButton.rect}
        sprite={C.startButton.sprite}
        pressedSprite={C.startButton.pressedSprite}
        label={C.startButton.label}
        disabled={!ready || busy}
        onPress={handleStart}
      />
    </div>
  );
}

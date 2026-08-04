import { useMemo, type CSSProperties } from 'react';
import {
  BOARD_TUNING,
  arrowPlacements,
  boardRect,
  cellPosition,
  computeBoardGeometry,
  outlineRect,
  revealedSliceCell,
  type BoardGeometry,
  type Cell,
  type GameState,
  type Tile,
} from '../../game';
import { PUZZLE_CHROME } from '../../layout/chrome';
import { ORIENTATION } from '../../canvas/reference';
import { rectStyle, textStyle } from '../../layout/rect';
import styles from './Board.module.css';

interface BoardProps {
  readonly state: GameState;
  /** Square artwork URL, or null while it loads. */
  readonly artworkUrl: string | null;
  readonly parentWidth: number;
  readonly parentHeight: number;
  readonly onTileTap: (cell: Cell) => void;
  readonly onArrowTap: (cell: Cell) => void;
}

const TUNING = BOARD_TUNING[ORIENTATION];
const CHROME = PUZZLE_CHROME[ORIENTATION];

/**
 * Background offset for a tile's slice.
 *
 * The picture is divided into `cols × rows` EQUAL parts, so the offset uses
 * `cellSize` alone — the inter-tile gap is not part of the image
 * (docs/game-logic.md §2.2). Driven by `correctCell`; the tile's screen position
 * comes from `currentCell`.
 */
function sliceStyle(tile: Tile, geometry: BoardGeometry, artworkUrl: string, cols: number, rows: number) {
  return {
    backgroundImage: `url("${artworkUrl}")`,
    backgroundSize: `${geometry.cellSize * cols}px ${geometry.cellSize * rows}px`,
    backgroundPosition: `${-tile.correctCell.x * geometry.cellSize}px ${
      -tile.correctCell.y * geometry.cellSize
    }px`,
  };
}

/**
 * The puzzle board.
 *
 * Layer order matches Unity sibling order (pixel-perfect §5):
 *   1. Outline — board + `tileSpacing` overhang, white, non-interactive
 *   2. Arrows — rendered behind tiles so they don't overlap tile faces
 *   3. Tiles
 *   4. Empty slot — gains the 9th slice on win
 *
 * `BoardPanel_Container` (holding the artwork title) mirrors the board rect and
 * renders above it.
 */
export function Board({
  state,
  artworkUrl,
  parentWidth,
  parentHeight,
  onTileTap,
  onArrowTap,
}: BoardProps) {
  const { board } = state;

  const geometry = useMemo(
    () => computeBoardGeometry(parentWidth, parentHeight, TUNING),
    [parentWidth, parentHeight],
  );

  const rect = useMemo(
    () => boardRect(parentWidth, parentHeight, geometry, TUNING),
    [parentWidth, parentHeight, geometry],
  );

  const arrows = useMemo(
    () => (board ? arrowPlacements(board, geometry, TUNING) : []),
    [board, geometry],
  );

  if (!board) return null;

  const { cols, rows } = { cols: board.size.cols, rows: board.size.rows };
  const outline = outlineRect(geometry);
  const revealed = revealedSliceCell(state);

  // TESTING (2026-07-30): keep the movement arrows on at all times so the
  // affordance can be checked during a slide / preview / after a win too. Flip
  // to false to restore the Unity behaviour (arrows hide while animating, after
  // a win, and while the preview is held).
  const KEEP_ARROWS_VISIBLE_FOR_TESTING = true;
  const arrowsVisible =
    KEEP_ARROWS_VISIBLE_FOR_TESTING ||
    (!state.isAnimating && !state.isSolved && !state.previewVisible);

  const boardBox = {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };

  return (
    <>
      <div className={styles.board} style={boardBox}>
        <div
          className={styles.outline}
          style={{
            left: `${outline.left}px`,
            top: `${outline.top}px`,
            width: `${outline.width}px`,
            height: `${outline.height}px`,
          }}
        />

        {arrowsVisible
          ? arrows.map((arrow) => {
              // up | down | left | right — for the accessible name only. The
              // pulse is a uniform scale, so it is the same for every direction.
              const dir = arrow.asset.replace('arrow-', '').replace(/\.(png|svg)$/, '');
              return (
                <button
                  key={arrow.index}
                  type="button"
                  className={styles.arrow}
                  style={
                    {
                      width: `${arrow.size}px`,
                      height: `${arrow.size}px`,
                      // Position via left/top, NOT transform: the pulse animates
                      // `transform`, and combining it with a positioning
                      // transform scales the position (drift to bottom-right).
                      left: `${arrow.position.x}px`,
                      top: `${arrow.position.y}px`,
                      backgroundImage: `url("/assets/gameplay/${arrow.asset}")`,
                    } as CSSProperties
                  }
                  onClick={() => onArrowTap(arrow.targetCell)}
                  aria-label={`Move the tile ${dir}`}
                />
              );
            })
          : null}

        {board.tiles.map((tile) => {
          const position = cellPosition(tile.currentCell, geometry);
          return (
            <button
              key={tile.index}
              type="button"
              className={styles.tile}
              style={{
                width: `${geometry.cellSize}px`,
                height: `${geometry.cellSize}px`,
                transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
                ...(artworkUrl ? sliceStyle(tile, geometry, artworkUrl, cols, rows) : {}),
              }}
              onClick={() => onTileTap(tile.currentCell)}
              aria-label={`Tile ${tile.index + 1}`}
            />
          );
        })}

        {revealed ? (
          <div
            className={styles.revealedSlice}
            style={{
              width: `${geometry.cellSize}px`,
              height: `${geometry.cellSize}px`,
              transform: `translate3d(${cellPosition(revealed, geometry).x}px, ${
                cellPosition(revealed, geometry).y
              }px, 0)`,
              ...(artworkUrl
                ? sliceStyle(
                    { index: -1, correctCell: revealed, currentCell: revealed },
                    geometry,
                    artworkUrl,
                    cols,
                    rows,
                  )
                : {}),
            }}
          />
        ) : null}
      </div>

      {/* BoardPanel_Container — mirrors the board rect, renders above it. */}
      <div className={styles.titleContainer} style={boardBox}>
        <div
          className={styles.artworkTitle}
          style={{
            ...rectStyle(CHROME.artworkTitleRect),
            ...textStyle(CHROME.artworkTitleText),
          }}
        >
          {/* Wrapped so the ellipsis has something to clip: `text-overflow` needs
              an overflowing BLOCK, and a bare text node inside a flex box becomes
              an anonymous flex item that ignores it. */}
          <span className={styles.artworkTitleText}>{state.identity.artworkTitle ?? ''}</span>
        </div>
      </div>
    </>
  );
}

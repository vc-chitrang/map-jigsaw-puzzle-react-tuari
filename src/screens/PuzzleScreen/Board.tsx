import { useMemo } from 'react';
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
import { PUZZLE_PORTRAIT } from '../../layout/portrait';
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

const TUNING = BOARD_TUNING.portrait;

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
 *   2. Tiles
 *   3. Empty slot — gains the 9th slice on win
 *   4. Arrows — on top
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

  // Arrows are hidden during a slide and stay hidden after the win.
  const arrowsVisible = !state.isAnimating && !state.isSolved && !state.previewVisible;

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

        {arrowsVisible
          ? arrows.map((arrow) => (
              <button
                key={arrow.index}
                type="button"
                className={styles.arrow}
                style={{
                  width: `${arrow.size}px`,
                  height: `${arrow.size}px`,
                  transform: `translate3d(${arrow.position.x}px, ${arrow.position.y}px, 0)`,
                  backgroundImage: `url("/assets/gameplay/${arrow.asset}")`,
                }}
                onClick={() => onArrowTap(arrow.targetCell)}
                aria-label={`Move the tile ${arrow.asset.replace('arrow-', '').replace('.png', '')}`}
              />
            ))
          : null}
      </div>

      {/* BoardPanel_Container — mirrors the board rect, renders above it. */}
      <div className={styles.titleContainer} style={boardBox}>
        <div
          className={styles.artworkTitle}
          style={{
            ...rectStyle(PUZZLE_PORTRAIT.artworkTitle.rect),
            ...textStyle(PUZZLE_PORTRAIT.artworkTitle.text),
          }}
        >
          {state.identity.artworkTitle ?? ''}
        </div>
      </div>
    </>
  );
}

import { describe, expect, it } from 'vitest';
import { PUZZLE_LANDSCAPE as L } from './landscape';
import { PUZZLE_PORTRAIT as P } from './portrait';
import { rectStyle } from './rect';
import { BOARD_TUNING, computeBoardGeometry, boardRect } from '../game';
import { REFERENCE } from '../canvas/reference';

describe('landscape differs from portrait in more than position', () => {
  it('uses a 72² back button, not 124²', () => {
    expect(L.backButton.rect).toMatchObject({ size: { x: 72, y: 72 }, pos: { x: 60, y: 0 } });
    expect(P.backButton.rect).toMatchObject({ size: { x: 124, y: 124 }, pos: { x: 40, y: 60 } });
  });

  it('puts the logo top-RIGHT rather than top-centre', () => {
    // Portrait spans 0.3969–0.6031 (centred); landscape 0.868–0.9337 (right).
    expect(L.appLogo.rect.anchorMin.x).toBeGreaterThan(0.8);
    expect(P.appLogo.rect.anchorMin.x).toBeLessThan(0.5);
  });

  it('uses smaller type throughout', () => {
    expect(L.startButton.label.fontSizePx).toBe(82);
    expect(P.startButton.label.fontSizePx).toBe(112);

    expect(L.footerButtons.reset.label.fontSizePx).toBe(44);
    expect(P.footerButtons.reset.label.fontSizePx).toBe(68);

    expect(L.timer.label.fontSizePx).toBe(82);
    expect(P.timer.label.fontSizePx).toBe(100);

    expect(L.highScore.value.fontSizePx).toBe(52);
    expect(P.highScore.value.fontSizePx).toBe(82);

    expect(L.caption.text.fontSizePx).toBe(68);
    expect(P.caption.text.fontSizePx).toBe(83);
  });

  it('uses a flat high-score fill, not the 9-sliced sprite', () => {
    expect(L.highScore.background).toBe('#67787F');
    // Portrait masks Circle_9Sliced and tints it via a token.
    expect(P.highScore.sprite).toContain('circle-9sliced');
  });

  it('insets the preview image on the WIDTH, where portrait insets the height', () => {
    expect(L.preview.imageRect).toMatchObject({ size: { x: -1680, y: 0 } });
    expect(P.preview.imageRect).toMatchObject({ size: { x: 0, y: -1680 } });
  });

  it('keeps the artwork title identical — it is runtime-created from one code path', () => {
    expect(L.artworkTitle.rect).toEqual(P.artworkTitle.rect);
    expect(L.artworkTitle.text.fontSizePx).toBe(P.artworkTitle.text.fontSizePx);
  });

  it('records that SideStrip does not ship', () => {
    expect(L.sideStripShips).toBe(false);
  });
});

describe('landscape footer band', () => {
  it('sits 40 px above the bottom and is 196 px tall', () => {
    const style = rectStyle(L.footerRect) as Record<string, string>;
    // top = 100% − pos.y − (1 − pivot.y) × height = 100% − 40 − 196
    expect(style['top']).toBe('calc(100.0000% - 236px)');
    expect(style['height']).toBe('196px');
  });

  it('places the caption ABOVE the band', () => {
    // anchorMax.y = 1.8145 > 1, so top is negative.
    const style = rectStyle(L.caption.rect) as Record<string, string>;
    expect(style['top']).toBe('-81.4500%');
  });
});

describe('landscape footer children fit their container', () => {
  it('total width plus gaps fits the controls container', () => {
    const containerWidth =
      (L.controls.rect.anchorMax.x - L.controls.rect.anchorMin.x) * REFERENCE.landscape.w;

    // Gameplay row: timer + high score + reset + preview + new image.
    const widths = [
      L.timer.size.x,
      L.highScore.size.x,
      L.footerButtons.reset.size.x,
      L.footerButtons.preview.size.x,
      L.footerButtons.newImage.size.x,
    ];
    const total = widths.reduce((a, b) => a + b, 0) + L.controls.gapPx * (widths.length - 1);

    expect(total).toBeLessThanOrEqual(containerWidth);
    // Sanity: it should not be wildly undersized either, or the layout group's
    // force-expand would spread them implausibly far apart.
    expect(total).toBeGreaterThan(containerWidth * 0.85);
  });

  it('each footer label has a left margin that clears its icon', () => {
    for (const key of ['reset', 'preview', 'newImage'] as const) {
      const button = L.footerButtons[key];
      const iconRight = button.icon.rect.pos.x + button.icon.rect.size.x;
      // The label must start at or beyond the icon's right edge.
      expect(button.label.marginPx.left).toBeGreaterThanOrEqual(iconRight - 45);
    }
  });
});

describe('board geometry per orientation', () => {
  it('uses the landscape padding factor and panel offset', () => {
    expect(BOARD_TUNING.landscape.paddingFactor).toBe(0.68);
    expect(BOARD_TUNING.landscape.panelOffset).toEqual({ x: 0, y: 100 });
  });

  it('produces a square board sized from the shorter axis', () => {
    const geometry = computeBoardGeometry(
      REFERENCE.landscape.w,
      REFERENCE.landscape.h,
      BOARD_TUNING.landscape,
    );
    // min(3840, 2160) × 0.68
    expect(geometry.boardSize).toBeCloseTo(1468.8, 8);
  });

  it('lifts the board 100 px above centre', () => {
    const geometry = computeBoardGeometry(
      REFERENCE.landscape.w,
      REFERENCE.landscape.h,
      BOARD_TUNING.landscape,
    );
    const rect = boardRect(
      REFERENCE.landscape.w,
      REFERENCE.landscape.h,
      geometry,
      BOARD_TUNING.landscape,
    );
    expect(rect.top + rect.height / 2).toBeCloseTo(REFERENCE.landscape.h / 2 - 100, 8);
    expect(rect.left + rect.width / 2).toBeCloseTo(REFERENCE.landscape.w / 2, 8);
  });
});

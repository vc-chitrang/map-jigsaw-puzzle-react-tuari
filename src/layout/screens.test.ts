import { describe, expect, it } from 'vitest';
import { IMAGE_SELECT_LAYOUT, CROP_LAYOUT, BROWSE_LAYOUT, WIN_LAYOUT } from './screens';
import { CROP_SHARED } from './crop';
import { CARD_GRID } from './browse';
import { rectStyle } from './rect';
import { REFERENCE } from '../canvas/reference';

const ISP = IMAGE_SELECT_LAYOUT.portrait;
const ISL = IMAGE_SELECT_LAYOUT.landscape;
const CP = CROP_LAYOUT.portrait;
const CL = CROP_LAYOUT.landscape;
const BP = BROWSE_LAYOUT.portrait;
const BL = BROWSE_LAYOUT.landscape;
const WP = WIN_LAYOUT.portrait;
const WL = WIN_LAYOUT.landscape;

/** Both scenes use the same 72² back button and top-right logo in landscape. */
describe('landscape chrome is consistent across the four screens', () => {
  it('uses a 72² back button everywhere, where portrait uses 124²', () => {
    for (const table of [ISL, CL, BL]) {
      expect(table.backButton.rect).toMatchObject({
        size: { x: 72, y: 72 },
        pos: { x: 60, y: 0 },
      });
    }
    for (const table of [ISP, CP, BP]) {
      expect(table.backButton.rect).toMatchObject({
        size: { x: 124, y: 124 },
        pos: { x: 40, y: 60 },
      });
    }
  });

  it('puts the logo top-RIGHT, not top-centre', () => {
    for (const table of [ISL, CL, BL]) {
      const rect = table.appLogo.rect;
      if (rect.kind !== 'fractional') throw new Error('expected a fractional logo rect');
      expect(rect.anchorMin.x).toBeCloseTo(0.868, 6);
      expect(rect.anchorMax.x).toBeCloseTo(0.9337, 6);
    }
  });

  it('uses the landscape background sprite', () => {
    for (const table of [ISL, CL, BL]) {
      expect(table.screen.background).toContain('background-landscape');
    }
  });
});

describe('ImageSelect — landscape', () => {
  it('reparents the description to the SCREEN', () => {
    expect(ISL.descriptionParent).toBe('screen');
    expect(ISP.descriptionParent).toBe('panel');
  });

  it('hangs the description 98 px below the screen top, 92 px tall', () => {
    const style = rectStyle(ISL.descriptionRect) as Record<string, string>;
    // top = (1 − anchorY)·100% − pos.y − (1 − pivot.y)·height = 0 + 98 − 0
    expect(style['top']).toBe('98px');
    expect(style['height']).toBe('92px');
  });

  it('places the two choices SIDE BY SIDE, not stacked', () => {
    const collection = ISL.collectionButton.rect;
    const qr = ISL.qrPanel.rect;
    if (collection.kind !== 'fractional' || qr.kind !== 'fractional') {
      throw new Error('landscape choices should be fractional rects');
    }
    // Collection is entirely left of the QR panel, and they overlap vertically.
    expect(collection.anchorMax.x).toBeLessThan(qr.anchorMin.x);
    expect(collection.anchorMin.y).toBeCloseTo(0.2615, 6);
    expect(qr.anchorMin.y).toBeCloseTo(0.2632, 6);

    // Portrait stacks two POINT rects instead.
    expect(ISP.collectionButton.rect.kind).toBe('point');
    expect(ISP.qrPanel.rect.kind).toBe('point');
  });

  it('shrinks the captions but keeps the button label at 52 px', () => {
    expect(ISL.collectionButton.caption.fontSizePx).toBe(30);
    expect(ISL.qrPanel.caption.fontSizePx).toBe(32);
    expect(ISP.collectionButton.caption.fontSizePx).toBe(52);
    expect(ISP.qrPanel.caption.fontSizePx).toBe(52);

    expect(ISL.collectionButton.label.fontSizePx).toBe(52);
    expect(ISP.collectionButton.label.fontSizePx).toBe(52);
  });

  it('uses a thinner, shorter divider BELOW centre', () => {
    expect(ISL.dividerRect).toMatchObject({ size: { x: 1, y: 78 }, pos: { x: 0, y: -32 } });
    expect(ISP.dividerRect).toMatchObject({ size: { x: 2, y: 142 }, pos: { x: 0, y: 68 } });
  });
});

describe('Crop — landscape', () => {
  it('has a square stage equal to the landscape board size', () => {
    const width = (CL.stageRect.anchorMax.x - CL.stageRect.anchorMin.x) * REFERENCE.landscape.w;
    const height = (CL.stageRect.anchorMax.y - CL.stageRect.anchorMin.y) * REFERENCE.landscape.h;
    expect(width).toBeCloseTo(height, 6);
    // min(3840, 2160) × 0.68 — the landscape board padding factor.
    expect(width).toBeCloseTo(1468.8, 6);
  });

  it('keeps the portrait stage square too, at its own size', () => {
    const width = (CP.stageRect.anchorMax.x - CP.stageRect.anchorMin.x) * REFERENCE.portrait.w;
    const height = (CP.stageRect.anchorMax.y - CP.stageRect.anchorMin.y) * REFERENCE.portrait.h;
    expect(width).toBeCloseTo(height, 4);
    expect(width).toBeCloseTo(1520.64, 4);
  });

  it('reparents the description to the SCREEN', () => {
    expect(CL.descriptionParent).toBe('screen');
    expect(CP.descriptionParent).toBe('stage');
  });

  it('doubles the initial grid size on a smaller stage', () => {
    expect(CL.gridInitialSize).toBe(1000);
    expect(CP.gridInitialSize).toBe(500);
  });

  it('uses smaller rotate buttons, closer to the stage', () => {
    expect(CL.rotateButtons.size).toEqual({ x: 80, y: 80 });
    expect(CL.rotateButtons.posY).toBe(-110);
    expect([CL.rotateButtons.anticlockwisePosX, CL.rotateButtons.clockwisePosX]).toEqual([-80, 80]);

    expect(CP.rotateButtons.size).toEqual({ x: 120, y: 120 });
    expect(CP.rotateButtons.posY).toBe(-160);
  });

  it('uses a point-anchored START of the landscape footer size', () => {
    expect(CL.startButton.rect).toMatchObject({ size: { x: 315, y: 121 }, pos: { x: 0, y: 100 } });
    expect(CL.startButton.label.fontSizePx).toBe(82);
    // Portrait authors the label uppercase at 100 px in a fractional rect.
    expect(CP.startButton.rect.kind).toBe('fractional');
    expect(CP.startButton.label.fontSizePx).toBe(100);
  });

  /**
   * ADR-022: these come from `CropGridResizer`'s SERIALIZED values, which are
   * identical in both scenes and differ from the C# initialisers (80 / 0.9 / 0.2).
   */
  it('shares the scene-serialized handle and minimum-size values', () => {
    expect(CROP_SHARED.handleSizePx).toBe(50);
    expect(CROP_SHARED.minSizeFraction).toBe(0.5);
    expect(CROP_SHARED.handleColour).toBe('rgb(255 255 255 / 1)');

    for (const table of [CP, CL]) {
      expect(table.handleSizePx).toBe(CROP_SHARED.handleSizePx);
      expect(table.minSizeFraction).toBe(CROP_SHARED.minSizeFraction);
      expect(table.handleColour).toBe(CROP_SHARED.handleColour);
    }
  });
});

describe('Browse — landscape', () => {
  it('lists all five dropdowns with a uniform 36 px layout-group spacing', () => {
    expect(BL.filterDropdowns.items).toHaveLength(5);
    const stride =
      BL.filterDropdowns.items[1]!.posX - BL.filterDropdowns.items[0]!.posX;
    expect(stride).toBeCloseTo(570.2043, 4);
    // stride − width is the HorizontalLayoutGroup's spacing, 36 in BOTH scenes.
    expect(stride - BL.filterDropdowns.size.x).toBeCloseTo(36, 4);

    const portraitStride = BP.filterDropdowns.items[1]!.posX - BP.filterDropdowns.items[0]!.posX;
    expect(portraitStride - BP.filterDropdowns.size.x).toBeCloseTo(36, 4);
  });

  it('keeps the same five dropdown keys and labels as portrait', () => {
    expect(BL.filterDropdowns.items.map((item) => item.key)).toEqual(
      BP.filterDropdowns.items.map((item) => item.key),
    );
    expect(BL.filterDropdowns.items.map((item) => item.label)).toEqual(
      BP.filterDropdowns.items.map((item) => item.label),
    );
  });

  it('uses the 24.5 px filter title and a 23 px Clear Filters with a right margin', () => {
    expect(BL.filterBar.title.fontSizePx).toBe(24.5);
    expect(BP.filterBar.title.fontSizePx).toBe(42);
    expect(BL.filterBar.clearFilters.fontSizePx).toBe(23);
    expect(BL.filterBar.clearFilters.marginPx).toEqual({
      left: 0,
      top: 0,
      right: 10,
      bottom: 0,
    });
    expect(BP.filterBar.clearFilters.marginPx).toBeUndefined();
  });

  it('insets the card scroll by 75 px per side, not 100', () => {
    expect(BL.cardArea.scrollRect).toMatchObject({ size: { x: -150, y: 0 } });
    expect(BP.cardArea.scrollRect).toMatchObject({ size: { x: -200, y: 0 } });
    expect(BL.cardArea.arrowSize).toBe(40);
    expect(BP.cardArea.arrowSize).toBe(60);
  });

  /** ADR-022: `SetupGridLayout` uses spacing 16 and RectOffset(16, 16, 16, 40). */
  it('shares the code-derived grid maths across orientations', () => {
    expect(CARD_GRID.gapPx).toBe(16);
    expect(CARD_GRID.paddingPx).toEqual({ left: 16, right: 16, top: 16, bottom: 40 });
    for (const table of [BP, BL]) {
      expect(table.cardArea.targetCellSizePx).toBe(320);
      expect(table.cardArea.minColumns).toBe(2);
      expect(table.cardArea.gapPx).toBe(CARD_GRID.gapPx);
      expect(table.cardArea.paddingPx).toEqual(CARD_GRID.paddingPx);
    }
  });

  it('records the pagination layout-group spacing for both orientations', () => {
    expect(BL.pagination.barSpacingPx).toBe(30);
    expect(BP.pagination.barSpacingPx).toBe(50);
  });

  it('converts the edge-stretched page arrows the way Unity resolves them', () => {
    // PrevButton: anchors (0,0)-(0,1), pos (0,65), sizeDelta (75, −870.0001),
    // pivot (0,0.5) ⇒ 75 px wide, 870 px shorter than the panel, 370 px from its top.
    const prev = rectStyle(BL.cardArea.prevButtonRect) as Record<string, string>;
    expect(prev['left']).toBe('0.0000%');
    expect(prev['width']).toBe('75px');
    expect(prev['top']).toBe('370px');
    expect(prev['height']).toBe('calc(100.0000% - 870.0001px)');

    const next = rectStyle(BL.cardArea.nextButtonRect) as Record<string, string>;
    expect(next['left']).toBe('calc(100.0000% - 75px)');
    expect(next['height']).toBe('calc(100.0000% - 870px)');

    // The portrait table pre-resolved the same idiom to a point rect: the panel
    // is 2582.4 ref px tall and the scene's sizeDelta is −2001.
    const portraitPanelHeight =
      (0.7566 - 0.0841) * REFERENCE.portrait.h;
    expect(portraitPanelHeight - 2001).toBeCloseTo(581.4, 1);
  });

  it('stretches the search-bar buttons to the field height', () => {
    const clear = rectStyle(BL.searchBar.clearButtonRect) as Record<string, string>;
    expect(clear['left']).toBe('calc(100.0000% - 45px)');
    expect(clear['width']).toBe('30px');
    expect(clear['height']).toBe('100.0000%');

    const search = rectStyle(BL.searchBar.searchButtonRect) as Record<string, string>;
    // pivot.x = 0 on anchor x = 1, so it hangs OUTSIDE the field's right edge.
    expect(search['left']).toBe('100.0000%');
    expect(search['width']).toBe('70px');
  });
});

describe('Win — landscape', () => {
  it('uses a smaller popup than portrait', () => {
    const landscape = WL.popup.rect;
    const portrait = WP.popup.rect;
    if (landscape.kind !== 'fractional' || portrait.kind !== 'fractional') {
      throw new Error('expected fractional popup rects');
    }
    expect(landscape.anchorMax.x - landscape.anchorMin.x).toBeCloseTo(0.3298, 6);
    expect(portrait.anchorMax.x - portrait.anchorMin.x).toBeCloseTo(0.6944, 6);
  });

  it('shrinks the banner, the boxes and Play Again', () => {
    expect(WL.youWin.rect).toMatchObject({ size: { x: 400, y: 120 } });
    expect(WP.youWin.rect).toMatchObject({ size: { x: 500, y: 150 } });

    expect(WL.yourScore.boxRect).toMatchObject({ size: { x: 320, y: 104 } });
    expect(WP.yourScore.boxRect).toMatchObject({ size: { x: 400, y: 130 } });

    expect(WL.playAgain.rect).toMatchObject({ size: { x: 475.04, y: 120 } });
    expect(WP.playAgain.rect).toMatchObject({ size: { x: 530, y: 178 } });
  });

  it('uses the landscape font sizes and score margins', () => {
    expect(WL.youWin.text.fontSizePx).toBe(72);
    expect(WP.youWin.text.fontSizePx).toBe(80);

    expect(WL.yourScore.value.fontSizePx).toBe(74.2);
    expect(WL.highScore.value.fontSizePx).toBe(74.2);
    expect(WP.yourScore.value.fontSizePx).toBe(80);

    // TMP m_margin (10,10,10,10) on both landscape values; portrait has none.
    expect(WL.yourScore.value.marginPx).toEqual({ left: 10, top: 10, right: 10, bottom: 10 });
    expect(WP.yourScore.value.marginPx).toBeUndefined();

    expect(WL.playAgain.label.fontSizePx).toBe(68);
    expect(WL.playAgain.label.marginPx).toEqual({ left: 12, top: 0, right: 0, bottom: 12 });
    expect(WP.playAgain.label.marginPx).toEqual({ left: 20, top: 0, right: 0, bottom: 20 });
  });

  /**
   * ADR-022: `m_fontStyle` is 0 on both of these in both scenes, so Unity renders
   * "Play Again?" and "You Win!" mixed case. A blanket CSS `text-transform` used
   * to show "PLAY AGAIN?".
   */
  it('does NOT mark the win-screen text as uppercase', () => {
    for (const table of [WP, WL]) {
      expect(table.playAgain.label.uppercase).toBeUndefined();
      expect(table.youWin.text.uppercase).toBeUndefined();
      expect(table.playAgain.label.text).toBe('Play Again?');
      expect(table.youWin.text.text).toBe('You Win!');
    }
  });

  it('keeps the score labels at 60 px and right-extending in both orientations', () => {
    for (const table of [WP, WL]) {
      expect(table.yourScore.label.fontSizePx).toBe(60);
      expect(table.highScore.label.fontSizePx).toBe(60);
      // Boxes sit right of centre (pos.x = 20, pivot.x = 0); labels are centred
      // on the centre line and drawn right-aligned by CSS.
      expect(table.yourScore.boxRect).toMatchObject({ pos: { x: 20 }, pivot: { x: 0 } });
    }
  });
});

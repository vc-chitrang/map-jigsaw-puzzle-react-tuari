import { describe, expect, it } from 'vitest';
import { rectStyle, textStyle, type LayoutRect } from './rect';
import { PUZZLE_PORTRAIT as L } from './portrait';

describe('rectStyle — stretch', () => {
  it('is a plain inset for size (0,0)', () => {
    expect(rectStyle({ kind: 'stretch' })).toEqual({
      position: 'absolute',
      left: '0px',
      right: '0px',
      top: '0px',
      bottom: '0px',
    });
  });

  it('treats a negative sizeDelta as an inset split across both edges', () => {
    // PreviewImage: size (0, −1680) → 840 px off the top and 840 off the bottom.
    expect(rectStyle({ kind: 'stretch', size: { x: 0, y: -1680 } })).toEqual({
      position: 'absolute',
      left: '0px',
      right: '0px',
      top: '840px',
      bottom: '840px',
    });
  });
});

describe('rectStyle — fractional anchors (Idiom A)', () => {
  it('flips Y: top = (1 − anchorMax.y)', () => {
    // StartPuzzleButton, the worked example in pixel-perfect-replication §3.2.
    expect(rectStyle(L.startButton.rect)).toEqual({
      position: 'absolute',
      left: '23.3000%',
      width: '24.3600%',
      top: '62.9300%',
      height: '5.0500%',
    });
  });

  it('keeps AppLogo above the vertical midpoint', () => {
    const style = rectStyle(L.appLogo.rect) as Record<string, string>;
    // anchorMax.y = 0.9494 → top = 5.06 %
    expect(style['top']).toBe('5.0600%');
    expect(style['height']).toBe('6.7300%');
  });
});

describe('rectStyle — point anchor + size + pivot (Idiom B)', () => {
  it('matches the BackButton worked example: left 40px, top calc(50% − 122px)', () => {
    // anchor.x = 0, so the percentage term vanishes and `left` is a bare 40px —
    // exactly the CSS in pixel-perfect-replication §3.3.
    expect(rectStyle(L.backButton.rect)).toEqual({
      position: 'absolute',
      left: '40px',
      top: 'calc(50.0000% - 122px)',
      width: '124px',
      height: '124px',
    });
  });

  it('subtracts a positive Unity pos.y from top — +Y is UP in Unity', () => {
    const rect: LayoutRect = {
      kind: 'point',
      anchor: { x: 0.5, y: 0.5 },
      pos: { x: 0, y: 100 },
      size: { x: 0, y: 0 },
      pivot: { x: 0.5, y: 0.5 },
    };
    expect((rectStyle(rect) as Record<string, string>)['top']).toBe('calc(50.0000% - 100px)');
  });

  it('adds a negative Unity pos.y to top', () => {
    // The caption sits 377 px BELOW centre: pos.y = −377.
    expect((rectStyle(L.caption.rect) as Record<string, string>)['top']).toBe(
      'calc(50.0000% + 377px)',
    );
  });

  it('applies the pivot correction on both axes', () => {
    // TimerBackground: 526×194, pivot (0.5,0.5), pos (−313.65, −593.5649).
    //   left = 50% + (−313.65 − 0.5×526) = 50% − 576.65px
    //   top  = 50% − (−593.5649) − 0.5×194 = 50% + 496.5649px
    const style = rectStyle(L.timer.rect) as Record<string, string>;
    expect(style['left']).toBe('calc(50.0000% - 576.65px)');
    expect(style['top']).toBe('calc(50.0000% + 496.5649px)');
    expect(style['width']).toBe('526px');
    expect(style['height']).toBe('194px');
  });
});

describe('rectStyle — horizontal band', () => {
  it('places the artwork title 10 px ABOVE its parent’s top edge', () => {
    // anchorY 1, pivot.y 0, size.y 100, pos.y 10:
    //   top = 0% − 10 − (1 − 0)×100 = −110px, so the box's BOTTOM edge is at −10.
    expect(rectStyle(L.artworkTitle.rect)).toEqual({
      position: 'absolute',
      left: '0.0000%',
      width: '100.0000%',
      top: '-110px',
      height: '100px',
    });
  });

  it('places "HIGH SCORE" above the badge', () => {
    // pos.y 4.4, size.y 40, pivot.y 0 → top = −44.4px
    expect((rectStyle(L.highScore.titleRect) as Record<string, string>)['top']).toBe('-44.4px');
  });
});

describe('textStyle', () => {
  it('emits font size and colour', () => {
    expect(textStyle({ fontSizePx: 68, colour: 'var(--map-white)' })).toEqual({
      fontSize: '68px',
      color: 'var(--map-white)',
    });
  });

  it('maps TMP m_margin to padding so labels clear their icons', () => {
    // RESET carries a 90 px left margin; without it the label overlaps the icon.
    expect(textStyle(L.footerButtons.reset.label)).toEqual({
      fontSize: '68px',
      color: 'var(--map-white)',
      paddingLeft: '90px',
      paddingTop: '8px',
      paddingRight: '0px',
      paddingBottom: '16px',
    });
  });

  it('carries the margins recorded for every footer label', () => {
    expect(L.footerButtons.preview.label.marginPx).toEqual({
      left: 122,
      top: 0,
      right: 0,
      bottom: 16,
    });
    expect(L.footerButtons.newImage.label.marginPx).toEqual({
      left: 110,
      top: 10,
      right: 6,
      bottom: 18,
    });
    expect(L.startButton.label.marginPx).toEqual({ left: 16, top: 0, right: 0, bottom: 20 });
    expect(L.highScore.value.marginPx).toEqual({ left: 10, top: 10, right: 10, bottom: 10 });
  });

  it('leaves padding off when there is no margin', () => {
    expect(textStyle(L.timer.label)).not.toHaveProperty('paddingLeft');
    expect(textStyle(L.highScore.title)).not.toHaveProperty('paddingLeft');
  });
});

describe('layout table matches the scene dump', () => {
  it('uses the brand amber token for the title and caption, not the Unity hex', () => {
    expect(L.artworkTitle.text.colour).toBe('var(--colour-artwork-title)');
    expect(L.caption.text.colour).toBe('var(--colour-caption)');
  });

  it('records the 9-slice border for the high-score badge', () => {
    expect(L.highScore.sliceBorderPx).toBe(255);
  });

  it('keeps footer label strings exactly as authored', () => {
    // Lowercase in the scene; uppercased by CSS.
    expect(L.footerButtons.preview.label.text).toBe('preview');
    expect(L.footerButtons.newImage.label.text).toBe('new image');
    expect(L.footerButtons.reset.label.text).toBe('RESET');
  });
});

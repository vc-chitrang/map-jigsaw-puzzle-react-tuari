/**
 * Per-orientation geometry selection for the four non-Puzzle screens.
 *
 * The same idea as `chrome.ts`, one level up: each screen has one component tree,
 * and everything that differs between portrait and landscape is DATA in a table
 * (docs/architecture.md §2.6). The Puzzle footer is still the only place where
 * the layout MECHANISM differs and a component has to branch (ADR-019).
 *
 * Two things do not fit "same shape, different numbers", so they are modelled
 * explicitly rather than hidden:
 *
 * * `descriptionParent` — the instruction line is a child of the panel (portrait
 *   ImageSelect) / the crop stage (portrait Crop), but a child of the SCREEN in
 *   both landscape variants. The component reads this field instead of assuming.
 * * The `LayoutRect` union carries the idiom, so a rect that is a POINT in one
 *   orientation and a FRACTIONAL or edge-stretched band in the other needs no
 *   special case here.
 *
 * The interfaces below are deliberately explicit: they are what makes a missing
 * or misspelled field in a new table a compile error rather than an undefined at
 * runtime.
 */

import type { Orientation } from '../game/types';
import type { LayoutRect } from './rect';
import type { TextSpec } from './portrait';
import { IMAGE_SELECT_PORTRAIT, CROP_PORTRAIT } from './crop';
import { IMAGE_SELECT_LANDSCAPE, CROP_LANDSCAPE } from './crop-landscape';
import { BROWSE_PORTRAIT } from './browse';
import { BROWSE_LANDSCAPE } from './browse-landscape';
import { WIN_PORTRAIT } from './win';
import { WIN_LANDSCAPE } from './win-landscape';

/** Where the instruction line hangs. See the note above. */
export type DescriptionParent = 'screen' | 'panel' | 'stage';

export interface ImageSelectLayout {
  readonly screen: { readonly rect: LayoutRect; readonly background: string };
  readonly appLogo: { readonly rect: LayoutRect; readonly sprite: string };
  readonly backButton: { readonly rect: LayoutRect; readonly sprite: string };
  readonly panelRect: LayoutRect;
  readonly panelBackground: string;
  readonly descriptionParent: DescriptionParent;
  readonly descriptionRect: LayoutRect;
  readonly description: TextSpec;
  readonly collectionButton: {
    readonly rect: LayoutRect;
    readonly background: string;
    readonly captionRect: LayoutRect;
    readonly caption: TextSpec;
    readonly iconRect: LayoutRect;
    readonly iconSprite: string;
    readonly labelRect: LayoutRect;
    readonly label: TextSpec;
  };
  readonly qrPanel: {
    readonly rect: LayoutRect;
    readonly sprite: string;
    readonly sliceBorderPx: number;
    readonly captionRect: LayoutRect;
    readonly caption: TextSpec;
    readonly codeRect: LayoutRect;
    readonly codeSprite: string;
  };
  readonly dividerRect: LayoutRect;
  readonly dividerSprite: string;
}

export interface CropLayout {
  readonly screen: { readonly rect: LayoutRect; readonly background: string };
  readonly appLogo: { readonly rect: LayoutRect; readonly sprite: string };
  readonly backButton: { readonly rect: LayoutRect; readonly sprite: string };
  /** Fractional in both orientations — `CropScreen` derives the stage size from it. */
  readonly stageRect: Extract<LayoutRect, { kind: 'fractional' }>;
  readonly stageBackground: string;
  readonly descriptionParent: DescriptionParent;
  readonly descriptionRect: LayoutRect;
  readonly description: TextSpec;
  readonly gridSprite: string;
  readonly gridInitialSize: number;
  readonly handleSizePx: number;
  readonly handleColour: string;
  readonly minSizeFraction: number;
  readonly rotateButtons: {
    readonly size: { readonly x: number; readonly y: number };
    readonly posY: number;
    readonly anticlockwisePosX: number;
    readonly clockwisePosX: number;
    readonly background: string;
    readonly sprite: string;
    readonly sliceBorderPx: number;
    readonly iconSprite: string;
    readonly iconColour: string;
    readonly iconInsetPx: number;
  };
  readonly startButton: {
    readonly rect: LayoutRect;
    readonly sprite: string;
    readonly pressedSprite: string;
    readonly label: TextSpec;
  };
}

export interface BrowseLayout {
  readonly screen: { readonly rect: LayoutRect; readonly background: string };
  readonly appLogo: { readonly rect: LayoutRect; readonly sprite: string };
  readonly backButton: {
    readonly rect: LayoutRect;
    readonly sprite: string;
    readonly opacity: number;
  };
  readonly searchBar: {
    readonly rect: LayoutRect;
    readonly fieldRect: LayoutRect;
    readonly outlineColour: string;
    readonly textAreaRect: LayoutRect;
    readonly input: TextSpec;
    readonly placeholder: TextSpec;
    readonly clearButtonRect: LayoutRect;
    readonly clearSprite: string;
    readonly searchButtonRect: LayoutRect;
    readonly searchSprite: string;
  };
  readonly filterBar: {
    readonly rect: LayoutRect;
    readonly titleRect: LayoutRect;
    readonly title: TextSpec;
    readonly clearFiltersRect: LayoutRect;
    readonly clearFilters: TextSpec;
  };
  readonly filterDropdowns: {
    readonly size: { readonly x: number; readonly y: number };
    readonly posY: number;
    readonly items: readonly {
      readonly key: string;
      readonly label: string;
      readonly posX: number;
    }[];
    readonly label: TextSpec;
    readonly labelMarginPx: {
      readonly left: number;
      readonly top: number;
      readonly right: number;
      readonly bottom: number;
    };
    readonly arrowSprite: string;
    readonly arrowSize: number;
    readonly arrowInset: number;
    readonly popupHeight: number;
    readonly popupGap: number;
    readonly popupRowHeight: number;
    readonly outlineColour: string;
  };
  readonly resultInfoBar: {
    readonly rect: LayoutRect;
    readonly countRect: LayoutRect;
    readonly count: TextSpec;
    readonly sortRect: LayoutRect;
    readonly sortLabelRect: LayoutRect;
    readonly sortLabel: TextSpec;
    /** GridViewButton — visual only (there is a single grid view to switch to). */
    readonly gridViewRect: LayoutRect;
    readonly gridViewSprite: string;
  };
  readonly cardArea: {
    readonly containerRect: LayoutRect;
    readonly scrollRect: LayoutRect;
    readonly prevButtonRect: LayoutRect;
    readonly nextButtonRect: LayoutRect;
    readonly arrowSprite: string;
    readonly arrowSize: number;
    readonly targetCellSizePx: number;
    readonly minColumns: number;
    readonly gapPx: number;
    readonly paddingPx: {
      readonly left: number;
      readonly right: number;
      readonly top: number;
      readonly bottom: number;
    };
  };
  readonly pagination: {
    readonly rect: LayoutRect;
    readonly info: TextSpec;
    readonly barSpacingPx: number;
  };
  readonly card: {
    readonly titleFontSizePx: number;
    readonly metaFontSizePx: number;
    readonly titleColour: string;
    readonly metaColour: string;
    readonly captionHeightPx: number;
    readonly fontFamily: string;
  };
}

export interface WinLayout {
  readonly screenRect: LayoutRect;
  readonly popup: {
    readonly rect: LayoutRect;
    readonly background: string;
    readonly maskSprite: string;
    readonly maskSliceBorderPx: number;
    readonly patternColour: string;
    readonly outlineColour: string;
  };
  readonly youWin: {
    readonly rect: LayoutRect;
    readonly background: string;
    readonly text: TextSpec;
  };
  readonly yourScore: {
    readonly boxRect: LayoutRect;
    readonly boxBackground: string;
    readonly value: TextSpec;
    readonly labelRect: LayoutRect;
    readonly label: TextSpec;
  };
  readonly highScore: {
    readonly boxRect: LayoutRect;
    readonly boxBackground: string;
    readonly value: TextSpec;
    readonly labelRect: LayoutRect;
    readonly label: TextSpec;
  };
  readonly playAgain: {
    readonly rect: LayoutRect;
    readonly sprite: string;
    readonly pressedSprite: string;
    readonly label: TextSpec;
  };
}

export const IMAGE_SELECT_LAYOUT: Record<Orientation, ImageSelectLayout> = {
  portrait: IMAGE_SELECT_PORTRAIT,
  landscape: IMAGE_SELECT_LANDSCAPE,
};

export const CROP_LAYOUT: Record<Orientation, CropLayout> = {
  portrait: CROP_PORTRAIT,
  landscape: CROP_LANDSCAPE,
};

export const BROWSE_LAYOUT: Record<Orientation, BrowseLayout> = {
  portrait: BROWSE_PORTRAIT,
  landscape: BROWSE_LANDSCAPE,
};

export const WIN_LAYOUT: Record<Orientation, WinLayout> = {
  portrait: WIN_PORTRAIT,
  landscape: WIN_LANDSCAPE,
};

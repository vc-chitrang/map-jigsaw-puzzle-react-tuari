/**
 * The parts of the Puzzle screen that differ between orientations only by their
 * NUMBERS, so they can be data-driven from one component tree.
 *
 * The footer is deliberately NOT here: portrait positions its five controls
 * absolutely from fractional anchors, landscape lays them out with a
 * `HorizontalLayoutGroup`. That is a difference in mechanism, not in values, so it
 * is branched in the component instead of pretended away here
 * (docs/architecture.md §2.6 wants one component tree driven by data — this is
 * where that stops being possible).
 */

import type { Orientation } from '../game/types';
import type { LayoutRect } from './rect';
import { PUZZLE_PORTRAIT } from './portrait';
import { PUZZLE_LANDSCAPE } from './landscape';
import type { TextSpec } from './portrait';

export interface PuzzleChrome {
  readonly background: string;
  readonly appLogoRect: LayoutRect;
  readonly appLogoSprite: string;
  readonly backButtonRect: LayoutRect;
  readonly backButtonSprite: string;
  /** Full-screen backdrop for the preview overlay. */
  readonly previewImageRect: LayoutRect;
  readonly artworkTitleRect: LayoutRect;
  readonly artworkTitleText: TextSpec;
}

const PORTRAIT_CHROME: PuzzleChrome = {
  background: PUZZLE_PORTRAIT.screen.background,
  appLogoRect: PUZZLE_PORTRAIT.appLogo.rect,
  appLogoSprite: PUZZLE_PORTRAIT.appLogo.sprite,
  backButtonRect: PUZZLE_PORTRAIT.backButton.rect,
  backButtonSprite: PUZZLE_PORTRAIT.backButton.sprite,
  previewImageRect: PUZZLE_PORTRAIT.preview.imageRect,
  artworkTitleRect: PUZZLE_PORTRAIT.artworkTitle.rect,
  artworkTitleText: PUZZLE_PORTRAIT.artworkTitle.text,
};

const LANDSCAPE_CHROME: PuzzleChrome = {
  background: PUZZLE_LANDSCAPE.screen.background,
  appLogoRect: PUZZLE_LANDSCAPE.appLogo.rect,
  appLogoSprite: PUZZLE_LANDSCAPE.appLogo.sprite,
  backButtonRect: PUZZLE_LANDSCAPE.backButton.rect,
  backButtonSprite: PUZZLE_LANDSCAPE.backButton.sprite,
  previewImageRect: PUZZLE_LANDSCAPE.preview.imageRect,
  artworkTitleRect: PUZZLE_LANDSCAPE.artworkTitle.rect,
  artworkTitleText: PUZZLE_LANDSCAPE.artworkTitle.text,
};

export const PUZZLE_CHROME: Record<Orientation, PuzzleChrome> = {
  portrait: PORTRAIT_CHROME,
  landscape: LANDSCAPE_CHROME,
};

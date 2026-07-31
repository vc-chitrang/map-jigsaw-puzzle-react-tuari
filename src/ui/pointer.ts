/**
 * Pointer gesture helpers. Pure — no React, no DOM.
 *
 * Lived in `ui/keyboard/layout.ts` until the in-app keyboard was removed
 * (ADR-049). The tap-versus-drag rule is not keyboard-specific: it is what keeps a
 * scroll of the card grid from being mistaken for a tap on the backdrop.
 */

/**
 * Tap-versus-drag threshold.
 *
 * `HandleKeyboardDismiss`: on pointer UP, if the pointer moved less than 15 px it
 * was a tap, not a scroll (docs/ui-spec.md §5).
 */
export const TAP_SLOP_PX = 15;

/** True when a pointer gesture counts as a tap rather than a drag. */
export function isTap(startX: number, startY: number, endX: number, endY: number): boolean {
  const dx = endX - startX;
  const dy = endY - startY;
  return Math.hypot(dx, dy) < TAP_SLOP_PX;
}

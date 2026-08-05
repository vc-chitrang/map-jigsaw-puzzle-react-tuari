import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ELLIPSIS, truncateToWidth } from './truncate';

/**
 * One line of text, cut to its container's width with a literal "..." tail.
 *
 * Replaces `text-overflow: ellipsis`, which delegates the truncation glyph to the
 * font — and Conduit ITC's U+2026 renders as a stray mark rather than three dots.
 * See `truncate.ts`.
 *
 * Measures with a canvas rather than the DOM: `measureText` needs no layout, so a
 * binary search over prefixes costs nothing, where probing the DOM would force a
 * reflow per step.
 *
 * Re-fits on three triggers, because getting any of them wrong leaves stale text:
 *   * the text changing,
 *   * the container resizing (orientation, window, a canvas rescale),
 *   * webfonts finishing — measuring against a fallback face gives the wrong width,
 *     and `font-display: block` means the real face arrives after first paint.
 */

/** One canvas for the whole app; `measureText` needs no per-call context. */
let sharedContext: CanvasRenderingContext2D | null = null;

function measurer(font: string): ((candidate: string) => number) | null {
  if (sharedContext === null) {
    sharedContext = document.createElement('canvas').getContext('2d');
  }
  if (sharedContext === null) return null;
  sharedContext.font = font;
  const context = sharedContext;
  return (candidate: string) => context.measureText(candidate).width;
}

interface TruncatedTextProps {
  readonly text: string;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  /** Override the tail; defaults to three full stops. */
  readonly ellipsis?: string;
}

export function TruncatedText({ text, className, style, ellipsis = ELLIPSIS }: TruncatedTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(text);

  useEffect(() => {
    const element = ref.current;
    const container = element?.parentElement;
    if (!element || !container) return;

    let cancelled = false;

    const fit = () => {
      if (cancelled) return;

      const own = getComputedStyle(element);
      // Build the shorthand by hand: `computed.font` is empty in Chromium when the
      // longhands were set individually, which is exactly how the layout tables do it.
      const font = `${own.fontStyle} ${own.fontWeight} ${own.fontSize} / ${own.lineHeight} ${own.fontFamily}`;
      const measure = measurer(font);
      if (!measure) return;

      // The container's CONTENT width. `clientWidth` includes padding, and the TMP
      // margins in the layout tables are emitted as padding, so it must come off.
      const box = getComputedStyle(container);
      const available =
        container.clientWidth - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight);

      setShown(truncateToWidth(text, measure, available, ellipsis));
    };

    fit();

    // Webfonts land after first paint (`font-display: block`), so the first measure
    // may have used a fallback face.
    void document.fonts?.ready.then(fit);

    const observer = new ResizeObserver(fit);
    observer.observe(container);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [text, ellipsis]);

  return (
    <span ref={ref} className={className} style={style} title={text}>
      {shown}
    </span>
  );
}

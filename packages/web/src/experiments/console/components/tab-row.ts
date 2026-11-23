/** A scrolling row's measures, as the browser reports them (px). */
export interface RowScroll {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

/**
 * Which edges of a tab row hide tabs past them, and so fade. 1 px of slack, so subpixel
 * rounding at a row's ends never fades a row that fits.
 */
export function edgeFades({ scrollLeft, scrollWidth, clientWidth }: RowScroll): {
  start: boolean;
  end: boolean;
} {
  return { start: scrollLeft > 1, end: scrollLeft + clientWidth < scrollWidth - 1 };
}

/**
 * Where a row scrolls to show a tab at `left` (from the row's start) and `width` wide whole: as
 * it is when the tab is in view, else just far enough to bring its hidden edge in.
 */
export function revealTab(
  { scrollLeft, clientWidth }: Pick<RowScroll, 'scrollLeft' | 'clientWidth'>,
  left: number,
  width: number
): number {
  if (left < scrollLeft) return left;
  if (left + width > scrollLeft + clientWidth) return left + width - clientWidth;
  return scrollLeft;
}

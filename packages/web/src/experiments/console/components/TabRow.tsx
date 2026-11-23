import { Children, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { edgeFades, revealTab } from './tab-row';

/**
 * A row of `TabLink`s on one line. Where the tabs do not fit, it scrolls sideways with no
 * scrollbar, fading the edge it hides tabs past (`.tab-row` in theme.css), and it brings the
 * active tab (`aria-current="page"`) into view when `active` or the number of tabs changes, and
 * whenever a resize moves the active tab within the row or changes the row's width: a phone
 * turned to portrait, or the web font arriving after the first reveal and widening every tab. A
 * resize that leaves both as they were (a badge widening a tab after the active one) does not
 * move the row, so it never undoes a person's own scroll. It scrolls itself, never through
 * `scrollIntoView`, which would scroll the page too. The bottom padding holds the active tab's
 * brand bar, which hangs below the tab and a scrolling row would otherwise clip.
 */
export function TabRow({
  active,
  children,
}: {
  active: string;
  children: ReactNode;
}): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const [fades, setFades] = useState({ start: false, end: false });
  const count = Children.count(children);

  useEffect(() => {
    const row = ref.current;
    if (row === null) return;
    const measure = (): void => {
      const next = edgeFades(row);
      setFades(was => (was.start === next.start && was.end === next.end ? was : next));
    };
    let seen = activePlace(row);
    const resized = (): void => {
      const place = activePlace(row);
      if (place !== seen) {
        seen = place;
        revealActive(row);
      }
      measure();
    };
    measure();
    row.addEventListener('scroll', measure, { passive: true });
    // The tabs as well as the row: a tab joining late (Factory, once the views are read) or a
    // badge widening one changes what fits without resizing the row. happy-dom and old
    // browsers have no ResizeObserver; the row then measures on mount and scroll alone.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resized);
    for (const el of [row, ...row.children]) observer?.observe(el);
    return () => {
      row.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [count]);

  useEffect(() => {
    if (ref.current !== null) revealActive(ref.current);
    // On the tab count too: a tab that joins late may be the active one.
  }, [active, count]);

  return (
    <div
      ref={ref}
      data-fade-start={fades.start ? '' : undefined}
      data-fade-end={fades.end ? '' : undefined}
      className="tab-row relative flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto pb-0.5"
    >
      {children}
    </div>
  );
}

/** Where the active tab sits in `row` and how wide the row is, as one comparable value. */
function activePlace(row: HTMLElement): string {
  const tab = row.querySelector<HTMLElement>('[aria-current="page"]');
  return [row.clientWidth, tab?.offsetLeft, tab?.offsetWidth].join(' ');
}

/** Scrolls `row` just far enough to show its active tab whole. */
function revealActive(row: HTMLElement): void {
  const tab = row.querySelector<HTMLElement>('[aria-current="page"]');
  if (tab !== null) row.scrollLeft = revealTab(row, tab.offsetLeft, tab.offsetWidth);
}

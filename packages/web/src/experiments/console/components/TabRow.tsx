import { Children, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { edgeFades, revealTab } from './tab-row';

/**
 * A row of `TabLink`s on one line. Where the tabs do not fit, it scrolls sideways with no
 * scrollbar, fading the edge it hides tabs past (`.tab-row` in theme.css), and it brings the
 * active tab (`aria-current="page"`) into view when `active` or the number of tabs changes. It
 * scrolls itself, never through `scrollIntoView`, which would scroll the page too. The bottom
 * padding holds the active tab's brand bar, which hangs below the tab and a scrolling row would
 * otherwise clip.
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
    measure();
    row.addEventListener('scroll', measure, { passive: true });
    // The tabs as well as the row: a tab joining late (Factory, once the views are read) or a
    // badge widening one changes what fits without resizing the row. happy-dom and old
    // browsers have no ResizeObserver; the row then measures on mount and scroll alone.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    for (const el of [row, ...row.children]) observer?.observe(el);
    return () => {
      row.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [count]);

  useEffect(() => {
    const row = ref.current;
    const tab = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (row == null || tab == null) return;
    row.scrollLeft = revealTab(row, tab.offsetLeft, tab.offsetWidth);
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

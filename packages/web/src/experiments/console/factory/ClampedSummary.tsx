import { useLayoutEffect, useRef, useState, type ReactElement } from 'react';

/**
 * The factory's summary paragraph. Below `md` it shows three lines and a More toggle, so the
 * numbers and Needs you start in a phone's first screen; at `md` and up it is never clamped.
 * The toggle shows only when it does something: while expanded, or when the clamped text
 * overflows, measured on mount and on every resize.
 */
export function ClampedSummary({ text }: { text: string }): ReactElement {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const measure = (): void => setOverflows(el.scrollHeight > el.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="flex max-w-3xl flex-col items-start gap-0.5">
      <p
        ref={ref}
        className={`text-sm leading-relaxed text-text-secondary ${
          expanded ? '' : 'line-clamp-3 md:line-clamp-none'
        }`}
      >
        {text}
      </p>
      {expanded || overflows ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="rounded text-console-12 font-medium text-text-tertiary hover:text-text-primary md:hidden"
        >
          {expanded ? 'Less' : 'More'}
        </button>
      ) : null}
    </div>
  );
}

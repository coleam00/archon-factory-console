import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * The width of the element `ref` is put on, followed as it resizes; 0 until measured, and in
 * a document with no ResizeObserver (happy-dom, old browsers) after the first read.
 */
export function useRowWidth(): { ref: RefObject<HTMLDivElement | null>; width: number } {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

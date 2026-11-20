import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type RefObject,
} from 'react';
import {
  MODAL_CLOSE_GUTTER_REM,
  MODAL_PAD_REM,
  stageModalSize,
  type StageShape,
} from '../lib/stage-modal-size';
import type { StageTab } from '../lib/views';

/** The custom properties the modal's panel reads from md up. */
type PanelVars = Record<
  '--stage-modal-w' | '--stage-modal-h' | '--modal-pad' | '--modal-gutter',
  string
>;

interface Viewport {
  width: number;
  height: number;
  /** The root font size, which the rem lengths of the layout scale with. */
  remPx: number;
}

let lastViewport: Viewport | undefined;
/** The window's size, the same object until it changes, as `useSyncExternalStore` needs. */
function viewportNow(): Viewport {
  const root = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize);
  // A test DOM computes no font size; the browser's default is 16 px.
  const remPx = Number.isFinite(root) && root > 0 ? root : 16;
  if (
    lastViewport?.width !== window.innerWidth ||
    lastViewport.height !== window.innerHeight ||
    lastViewport.remPx !== remPx
  )
    lastViewport = { width: window.innerWidth, height: window.innerHeight, remPx };
  return lastViewport;
}
function onResize(changed: () => void): () => void {
  window.addEventListener('resize', changed);
  return (): void => window.removeEventListener('resize', changed);
}

/**
 * The stage modal's size, as custom properties for its panel. The width is the size rule's
 * alone (`stageModalSize`). The height follows a measure, because the body's content arrives
 * after the modal opens (the step graph, the items): the panel's height less the scroller's is
 * the fixed chrome, and adding the content's full height gives the panel's natural height.
 * Setting the panel to that height leaves the sum unchanged, so it settles in one step. Where
 * there is no `ResizeObserver` (a test DOM) nothing is measured and the height is the content's.
 */
export function useStageModalSize(
  stage: StageShape | undefined,
  tab: StageTab
): {
  panelStyle: CSSProperties & PanelVars;
  panelRef: RefObject<HTMLDivElement | null>;
  scrollerRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
} {
  const viewport = useSyncExternalStore(onResize, viewportNow);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [naturalHeight, setNaturalHeight] = useState<number>();
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (panel === null || scroller === null || content === null) return;
    if (typeof ResizeObserver === 'undefined') return;
    // Fractional heights, not offsetHeight's whole pixels: a rounded-down body would scroll by
    // a pixel, and the scrollbar it brings would rewrap the content.
    const measure = (): void => {
      setNaturalHeight(
        panel.getBoundingClientRect().height -
          scroller.getBoundingClientRect().height +
          content.getBoundingClientRect().height
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    observer.observe(content);
    return (): void => observer.disconnect();
  }, []);
  const { width, height } = stageModalSize({
    stage,
    tab,
    naturalHeight,
    viewport: { width: viewport.width, height: viewport.height },
    remPx: viewport.remPx,
  });
  return {
    panelStyle: {
      '--stage-modal-w': `${String(width)}px`,
      '--stage-modal-h': height === undefined ? 'auto' : `${String(height)}px`,
      '--modal-pad': `${String(MODAL_PAD_REM)}rem`,
      '--modal-gutter': `${String(MODAL_CLOSE_GUTTER_REM)}rem`,
    },
    panelRef,
    scrollerRef,
    contentRef,
  };
}

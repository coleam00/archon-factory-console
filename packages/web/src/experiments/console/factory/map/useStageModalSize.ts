import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type RefObject,
} from 'react';
import type { FactoryDrilldown } from '../lib/drilldown-live';
import { MODAL_CLOSE_GUTTER_REM, MODAL_PAD_REM, stageModalSize } from '../lib/stage-modal-size';
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
 * (`stageModalSize`), from the drill-down and, on "The real workflow", the graph widths its
 * `StepGraph`s report through `tellGraphWidth` (laid out, not measured), plus the scrollbar
 * gutter the body keeps. The height follows a measure, because the body's content arrives
 * after the modal opens (the step graph, the items): the panel's height less the scroller's is
 * the fixed chrome, and adding the content's full height gives the panel's natural height.
 * Setting the panel to that height leaves the sum unchanged, so it settles in one step. Where
 * there is no `ResizeObserver` (a test DOM) nothing is measured and the height is the content's.
 */
export function useStageModalSize(
  drilldown: FactoryDrilldown | undefined,
  tab: StageTab
): {
  panelStyle: CSSProperties & PanelVars;
  /** For `StepGraphWidths`: each drawn graph's width by workflow, undefined when it goes. */
  tellGraphWidth: (workflow: string, width: number | undefined) => void;
  panelRef: RefObject<HTMLDivElement | null>;
  scrollerRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
} {
  const viewport = useSyncExternalStore(onResize, viewportNow);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [naturalHeight, setNaturalHeight] = useState<number>();
  const [scrollbarPx, setScrollbarPx] = useState(0);
  const [graphWidths, setGraphWidths] = useState<ReadonlyMap<string, number>>(new Map());
  const tellGraphWidth = useCallback((workflow: string, width: number | undefined): void => {
    setGraphWidths(current => {
      if (current.get(workflow) === width) return current;
      const next = new Map(current);
      if (width === undefined) next.delete(workflow);
      else next.set(workflow, width);
      return next;
    });
  }, []);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (panel === null || scroller === null || content === null) return;
    if (typeof ResizeObserver === 'undefined') return;
    // Fractional heights, not offsetHeight's whole pixels: a rounded-down body would scroll by
    // a pixel, and the scrollbar it brings would rewrap the content.
    const measure = (): void => {
      // The scroller keeps its scrollbar's gutter whether it scrolls or not, so this is the
      // same on every measure and cannot feed back into the width it adds to.
      setScrollbarPx(scroller.offsetWidth - scroller.clientWidth);
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
    drilldown,
    tab,
    graphWidth: graphWidths.size === 0 ? undefined : Math.max(...graphWidths.values()),
    naturalHeight,
    viewport: { width: viewport.width, height: viewport.height },
    scrollbarPx,
    remPx: viewport.remPx,
  });
  return {
    panelStyle: {
      '--stage-modal-w': `${String(width)}px`,
      '--stage-modal-h': height === undefined ? 'auto' : `${String(height)}px`,
      '--modal-pad': `${String(MODAL_PAD_REM)}rem`,
      '--modal-gutter': `${String(MODAL_CLOSE_GUTTER_REM)}rem`,
    },
    tellGraphWidth,
    panelRef,
    scrollerRef,
    contentRef,
  };
}

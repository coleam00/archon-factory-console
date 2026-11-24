import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import type { FactoryItem } from './api';
import { ItemAsksBody } from './ItemAsksBody';
import { displayItemKey } from './lib/item-key';
import { popoverPlace } from './lib/popover-place';
import type { BoardAsks, OpenAsk } from './useBoardAsks';
import type { FactoryAsks } from './useItemAsks';

// console-token-exception md:max-h-[calc(100vh-32px)] -- beside a card the popover keeps 16 px from the window's top and bottom, as popoverPlace places it.
const TALLEST = 'md:max-h-[calc(100vh-32px)]';
// console-token-exception md:w-[480px] -- Visual standard rule 9: the ask view is 480 px wide over the board.
const WIDTH = 'md:w-[480px]';
/** From md up, a box beside the card; under md, a sheet from the bottom that leaves the board's top in view. */
const SHELL = `console-root fixed z-50 flex flex-col gap-3 overflow-y-auto rounded-console-16 border border-border-bright bg-surface-elevated p-3 text-text-primary shadow-lg max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[85vh] max-md:rounded-b-none ${TALLEST}`;

/** Tailwind's md breakpoint: from here the popover sits beside its card; under it, a sheet. */
const WIDE = '(min-width: 48rem)';

/**
 * Where the popover sits, measured from the board card holding `trigger` (in the Table, the
 * Answer button itself) and the popover's own size: again on a resize, on any scroll, and
 * when its content changes size. Measured in a layout effect, so it is placed before it is
 * first painted. Null under md, where the sheet's classes place it.
 */
function usePlace(
  box: RefObject<HTMLDivElement | null>,
  trigger: HTMLElement
): { top: number; left: number } | null {
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) return;
    const update = (): void => {
      if (typeof window.matchMedia === 'function' && !window.matchMedia(WIDE).matches) {
        setPlace(null);
        return;
      }
      // A board card is the anchor; in the Table, the row is as wide as the page, so the button is.
      const anchor = (trigger.closest('article[data-card]') ?? trigger).getBoundingClientRect();
      const next = popoverPlace(
        anchor,
        { width: element.offsetWidth, height: element.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight }
      );
      setPlace(current =>
        current?.top === next.top && current.left === next.left ? current : next
      );
    };
    update();
    window.addEventListener('resize', update);
    // Capture: the column bodies and the board's row scroll on their own, and do not bubble.
    window.addEventListener('scroll', update, true);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    return (): void => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      observer?.disconnect();
    };
  }, [box, trigger]);
  return place;
}

/** What a press can land on that takes focus itself. */
const FOCUSABLE = 'a[href], button, input, textarea, select, [tabindex]';

/**
 * Closes on Esc and on a press outside the popover and its trigger. Esc is caught before it
 * reaches the card: the answer forms stop key events from leaving them, as a card can sit
 * inside another clickable one. A press on nothing that takes focus keeps the browser from
 * moving focus to the page, so it returns to the card; a press on a control focuses it.
 */
function useDismiss(
  box: RefObject<HTMLDivElement | null>,
  trigger: HTMLElement,
  close: () => void
): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    };
    const onPress = (event: MouseEvent): void => {
      const path = event.composedPath();
      if (path.includes(trigger) || (box.current !== null && path.includes(box.current))) return;
      const control = path.some(
        node => node instanceof window.HTMLElement && node.matches(FOCUSABLE)
      );
      if (!control) event.preventDefault();
      close();
    };
    // mousedown, not pointerdown: the browser moves focus on mousedown, after pointerdown.
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onPress);
    return (): void => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onPress);
    };
  }, [box, trigger, close]);
}

/** The item an ask view is open on: its read, and the key and title its card shows. */
export interface AskedItem {
  item: FactoryItem;
  title: string;
  order: string | null;
}

/**
 * The ask view over the board (owner change 3), and over the Overview from its Needs you rows:
 * the item's asks as Archon's own ask section draws them (`ItemAsksBody`), answered in place.
 * From md up it sits beside the card or row that opened it, or at the window's left edge when
 * there is no room beside it (`popoverPlace`); under md it is a sheet from the bottom. Nothing when none is open or the item has left the board.
 */
export function ItemAsksPopover({
  projectId,
  board,
  asks,
  itemOf,
}: {
  projectId: string;
  board: BoardAsks;
  asks: FactoryAsks;
  itemOf: (key: string) => AskedItem | undefined;
}): ReactElement | null {
  const { open } = board;
  const asked = open === null ? undefined : itemOf(open.key);
  if (open === null || asked === undefined) return null;
  return (
    <Popover
      key={open.key}
      projectId={projectId}
      open={open}
      asked={asked}
      asks={asks}
      board={board}
    />
  );
}

function Popover({
  projectId,
  open,
  asked,
  asks,
  board,
}: {
  projectId: string;
  open: OpenAsk;
  asked: AskedItem;
  asks: FactoryAsks;
  board: BoardAsks;
}): ReactElement {
  const box = useRef<HTMLDivElement>(null);
  const place = usePlace(box, open.trigger);
  useDismiss(box, open.trigger, board.close);
  useEffect(() => {
    box.current
      ?.querySelector<HTMLElement>('button, textarea, input')
      ?.focus({ preventScroll: true });
  }, []);
  const key = displayItemKey(asked.item.item.key, asked.order);
  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-modal="false"
      aria-label={`Asks on ${key}`}
      style={place == null ? undefined : { top: place.top, left: place.left }}
      className={SHELL}
    >
      <div className={`flex w-full flex-col gap-3 ${WIDTH}`}>
        <p className="line-clamp-2 text-console-13 font-semibold text-text-secondary">
          <span className="font-mono">{key}</span> {asked.title}
        </p>
        <ItemAsksBody projectId={projectId} item={asked.item} asks={asks} />
      </div>
    </div>,
    document.body
  );
}

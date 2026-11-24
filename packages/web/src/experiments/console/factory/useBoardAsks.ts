import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FactoryItem } from './api';
import type { OpenEntry } from './lib/attention';
import type { BoardModel } from './lib/board';
import type { FactoryAsks } from './useItemAsks';

/** The ask view open on the board: whose asks, and the control that opened it. */
export interface OpenAsk {
  key: string;
  trigger: HTMLElement;
}

/**
 * The board's asks, by item key: what waits on each card, and which item's ask view is
 * open. The board owns this rather than a card, so a card that remounts in another column
 * keeps it.
 */
export interface BoardAsks {
  /** The item's open asks and waits (`FactoryAsks.entriesOf`), newest first. */
  entriesOf: (key: string) => OpenEntry[];
  /** The item's progress could not be read, which its card says beside its asks. */
  unread: (key: string) => boolean;
  open: OpenAsk | null;
  /** Opens the item's ask view, or closes it when it is the one open. */
  openFor: (key: string, trigger: HTMLElement) => void;
  close: () => void;
}

/** Each item on the board's columns, by key. */
function itemsByKey(model: BoardModel | undefined): Map<string, FactoryItem> {
  return new Map(
    (model?.columns ?? []).flatMap(column =>
      column.cards.map(placed => [placed.card.key, placed.item])
    )
  );
}

/**
 * Focus back where the ask view was opened from: the control itself, else the card's ask
 * button drawn again under the same key, else the item's link. When the item has left the
 * board there is nothing to return to, and focus stays where it is.
 */
function focusBack({ key, trigger }: OpenAsk): void {
  if (trigger.isConnected) {
    trigger.focus();
    return;
  }
  const byKey = (selector: string, attribute: string): HTMLElement | undefined =>
    [...document.querySelectorAll<HTMLElement>(selector)].find(
      element => element.getAttribute(attribute) === key
    );
  const again = byKey('[data-ask-trigger]', 'data-ask-trigger');
  const card = byKey('[data-card]', 'data-card');
  (again ?? card?.querySelector<HTMLElement>('a'))?.focus();
}

/**
 * `all` is the unfiltered board, for what waits on each card; `shown` the board the filter
 * leaves, so the ask view closes when its item is filtered away or leaves the board.
 */
export function useBoardAsks({
  all,
  shown,
  asks,
}: {
  all: BoardModel | undefined;
  shown: BoardModel | undefined;
  asks: FactoryAsks;
}): BoardAsks {
  const items = useMemo(() => itemsByKey(all), [all]);
  const [open, setOpen] = useState<OpenAsk | null>(null);
  const opened = useRef<OpenAsk | null>(null);
  opened.current = open;
  const returnTo = useRef<OpenAsk | null>(null);

  const close = useCallback((): void => {
    if (opened.current !== null) returnTo.current = opened.current;
    setOpen(null);
  }, []);
  // After the board has drawn without the ask view, so the card's own controls are back.
  useEffect(() => {
    if (open !== null || returnTo.current === null) return;
    const back = returnTo.current;
    returnTo.current = null;
    focusBack(back);
  }, [open]);
  // An ask answered here stays in view, as answered, until a person closes it. The view closes
  // by itself when its item leaves the board or the filter, or when nothing is left in it (its
  // asks were answered elsewhere).
  const shownKeys = useMemo(() => new Set(itemsByKey(shown).keys()), [shown]);
  const openItem = open === null ? undefined : items.get(open.key);
  const emptied =
    openItem !== undefined &&
    asks.entriesOf(openItem).length === 0 &&
    asks.sectionOf(openItem).answered.length === 0;
  const openGone = open !== null && (!shownKeys.has(open.key) || emptied);
  useEffect(() => {
    if (openGone) close();
  }, [openGone, close]);

  return {
    entriesOf: key => {
      const item = items.get(key);
      return item === undefined ? [] : asks.entriesOf(item);
    },
    unread: key => items.get(key)?.progress === null,
    open,
    openFor: (key, trigger) => {
      if (opened.current?.key === key) close();
      else setOpen({ key, trigger });
    },
    close,
  };
}

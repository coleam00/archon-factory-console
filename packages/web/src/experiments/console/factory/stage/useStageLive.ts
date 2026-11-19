import { useEffect, useMemo, useRef } from 'react';
import type { FactoryItem } from '../../skills/factory';
import type { AttentionQueueItem } from '../../skills/runs';
import { stageLive, type MapLive, type Unread } from '../lib/map-live';
import type { FactoryViewListed } from '../lib/views';

/**
 * Where each item sits, by stage, for the map's chips and the stages opened from it, or why
 * that is not known yet (`items` undefined). It keeps where each item sat on the last read, as
 * the board does, so a run on a step no stage names holds its card where the board holds its
 * column. A page computes it once and hands the one value to everything that shows a stage's
 * items, so a card's "2 here" and the list under it never disagree.
 */
export function useStageLive(
  view: FactoryViewListed['declaration'],
  items: readonly FactoryItem[] | undefined,
  unread: Unread,
  queue: readonly AttentionQueueItem[] | undefined
): MapLive | Unread {
  const previous = useRef<ReadonlyMap<string, string>>(new Map());
  const live = useMemo(
    () => (items === undefined ? unread : stageLive(view, items, queue ?? [], previous.current)),
    [view, items, queue, unread]
  );
  useEffect(() => {
    if (typeof live !== 'string') previous.current = live.positions;
  }, [live]);
  return live;
}

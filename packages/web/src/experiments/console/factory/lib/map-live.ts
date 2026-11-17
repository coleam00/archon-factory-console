/**
 * The map's live chips: which items sit on each card, how many a run works now, and which
 * need a person. An item is placed by `placement.ts`, as the item page places it, so a card
 * and an item's header never name different stages; "needs you" is the item page's
 * `itemAsks`, which reads the Needs-you list's `needsYou`, so the chip agrees with both.
 */
import type { FactoryItem } from '../../skills/factory';
import type { AttentionQueueItem } from '../../skills/runs';
import { itemAsks } from './needs-you';
import { itemColumn, itemState, pageRunFacts, placementInput } from './placement';
import type { FactoryViewListed } from './views';

export interface StageLive {
  /** The items placed on this stage, in the order the items read returned them. */
  items: FactoryItem[];
  /** How many of them a run works now. */
  working: number;
  /** Those with an open ask or wait a person answers. */
  needYou: FactoryItem[];
}

/** Why an item is on no card: so the reader knows whether to fix the read or the view. */
export type NotOnMapWhy =
  /** The server could not derive the item's progress, so nothing places it. */
  | { kind: 'no-progress' }
  /** Placement found no column: the view names no stage for it (as the item page's "Position unknown"). */
  | { kind: 'no-column' }
  /** Placed on `stage`, which the map draws no card for. */
  | { kind: 'no-card'; stage: string };

export interface NotOnMap {
  item: FactoryItem;
  why: NotOnMapWhy;
}

export interface MapLive {
  /** Every declared stage, with or without a card, empty when nothing sits there. */
  stages: Map<string, StageLive>;
  /** Items no card shows: not placed, or on a stage without a card. */
  notOnMap: NotOnMap[];
}

/** Where one item goes on the map: a stage's entry, with whether a run works it and it needs you; or why not. */
type MapPlace =
  | { live: StageLive; stage: string; working: boolean; asks: boolean }
  | { ended: true }
  | { why: NotOnMapWhy };

function mapPlace(
  view: FactoryViewListed['declaration'],
  stages: ReadonlyMap<string, StageLive>,
  item: FactoryItem,
  attention: readonly AttentionQueueItem[]
): MapPlace {
  if (item.progress === null) return { why: { kind: 'no-progress' } };
  const asks = itemAsks(item, attention).length > 0;
  const input = placementInput(item, pageRunFacts(item.progress), asks);
  const column = itemColumn(view, input);
  // An item ended without a change (`endings`) is on no card, by design.
  if (column !== null && 'ended' in column) return { ended: true };
  const live = column === null ? undefined : stages.get(column.stage.id);
  // Reachable when the cached view changed under cached items: say so, as the item page does.
  if (column === null || live === undefined) return { why: { kind: 'no-column' } };
  return { live, stage: column.stage.id, working: itemState(input) === 'running', asks };
}

export function stageLive(
  view: FactoryViewListed['declaration'],
  items: readonly FactoryItem[],
  attention: readonly AttentionQueueItem[]
): MapLive {
  const carded = new Set(view.map.cards.map(card => card.stage));
  const stages = new Map<string, StageLive>(
    view.stages.map(stage => [stage.id, { items: [], working: 0, needYou: [] }])
  );
  const notOnMap: NotOnMap[] = [];
  for (const item of items) {
    const place = mapPlace(view, stages, item, attention);
    if ('why' in place) notOnMap.push({ item, why: place.why });
    if (!('live' in place)) continue;
    place.live.items.push(item);
    if (place.working) place.live.working += 1;
    if (place.asks) place.live.needYou.push(item);
    if (!carded.has(place.stage))
      notOnMap.push({ item, why: { kind: 'no-card', stage: place.stage } });
  }
  return { stages, notOnMap };
}

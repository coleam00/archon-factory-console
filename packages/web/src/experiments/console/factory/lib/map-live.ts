/**
 * The map's live chips: which items sit on each card, how many a run works now, and which
 * need a person. Placement is the board's (`placeItem`), so the map and the board agree; the
 * "needs you" test is the Needs-you list's (`needsYou`), so the chip agrees with the list.
 */
import type { AttentionQueueItem } from '../../skills/runs';
import { placeItem, type Declaration, type FactoryItem, type Placement } from './board';
import { needsYou } from './needs-you';

export interface StageLive {
  /** The items placed on this stage, in the order the items read returned them. */
  items: FactoryItem[];
  /** How many of them a run works now. */
  working: number;
  /** Those with an open ask or wait a person answers. */
  needYou: FactoryItem[];
}

/** An item the map cannot show on a card, with why, so the reader knows what to fix. */
export type NotOnMap =
  | { item: FactoryItem; why: Extract<Placement, { kind: 'unplaced' }> }
  /** Placed on `stage`, which the map draws no card for. */
  | { item: FactoryItem; why: { kind: 'no-card'; stage: string } };

export interface MapLive {
  /** Every declared stage, with or without a card, empty when nothing sits there. */
  stages: Map<string, StageLive>;
  /** Items no card shows: placed nowhere, or on a stage without a card. */
  notOnMap: NotOnMap[];
}

export function stageLive(
  view: Declaration,
  items: readonly FactoryItem[],
  attention: readonly AttentionQueueItem[]
): MapLive {
  const waiting = new Set(needsYou(attention).flatMap(entry => entry.item?.id ?? []));
  const carded = new Set(view.map.cards.map(card => card.stage));
  const stages = new Map<string, StageLive>(
    view.stages.map(stage => [stage.id, { items: [], working: 0, needYou: [] }])
  );
  const notOnMap: NotOnMap[] = [];
  for (const item of items) {
    const placement = placeItem(view, item);
    // An item ended without a change (`endings`) is on no card, by design.
    if (placement.kind === 'ended') continue;
    if (placement.kind === 'unplaced') {
      notOnMap.push({ item, why: placement });
      continue;
    }
    // The schema only lets placement name declared stages.
    const live = stages.get(placement.stage);
    if (live === undefined) throw new Error(`Placed on undeclared stage ${placement.stage}`);
    live.items.push(item);
    if (placement.working) live.working += 1;
    if (waiting.has(item.item.id)) live.needYou.push(item);
    if (!carded.has(placement.stage))
      notOnMap.push({ item, why: { kind: 'no-card', stage: placement.stage } });
  }
  return { stages, notOnMap };
}

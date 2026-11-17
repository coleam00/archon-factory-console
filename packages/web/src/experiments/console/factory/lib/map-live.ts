/**
 * The map's live chips: which items sit on each card, how many a run works now, and which
 * need a person. Placement is the board's (`placeItem`), so the map and the board agree; the
 * "needs you" test is the Needs-you list's (`needsYou`), so the chip agrees with the list.
 */
import type { AttentionQueueItem } from '../../skills/runs';
import { placeItem, type Declaration, type FactoryItem } from './board';
import { needsYou } from './needs-you';

export interface StageLive {
  /** The items placed on this stage, in the order the items read returned them. */
  items: FactoryItem[];
  /** How many of them a run works now. */
  working: number;
  /** Those with an open ask or wait a person answers. */
  needYou: FactoryItem[];
}

export interface MapLive {
  /** Every declared stage, with or without a card, empty when nothing sits there. */
  stages: Map<string, StageLive>;
  /** Items placed nowhere: progress unknown, or a run of a workflow no stage lists. */
  unplaced: FactoryItem[];
  /** Items placed on a stage the map draws no card for. */
  offMap: FactoryItem[];
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
  const unplaced: FactoryItem[] = [];
  const offMap: FactoryItem[] = [];
  for (const item of items) {
    const placement = placeItem(view, item);
    // An item ended without a change (`endings`) is on no card, by design.
    if (placement.kind === 'ended') continue;
    // The schema only lets placement name declared stages, so `live` is found for any stage.
    const live = placement.kind === 'stage' ? stages.get(placement.stage) : undefined;
    if (placement.kind !== 'stage' || live === undefined) {
      unplaced.push(item);
      continue;
    }
    live.items.push(item);
    if (placement.working) live.working += 1;
    if (waiting.has(item.item.id)) live.needYou.push(item);
    if (!carded.has(placement.stage)) offMap.push(item);
  }
  return { stages, unplaced, offMap };
}

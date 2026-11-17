/**
 * Whether an item's place waits on the change host: the server answers a change's merge
 * state `pending` while its first lookup still runs (`GET /api/factory/progress`), and the
 * console re-reads until it settles. Until then the item may belong in the landed column, so
 * no count that rule 2 of placement decides is shown as a number. A settled `unknown`, an
 * item whose progress could not be read and one with no change are final reads, not pending:
 * they are counted where placement puts them, and the card says so.
 */
import type { FactoryItem } from '../../skills/factory';

/** A change's merge state as the items read carries it. */
export type ChangeMerged = NonNullable<NonNullable<FactoryItem['progress']>['change']>['merged'];

/**
 * Whether the item's place waits on its merge state. A running item is placed by its run
 * (rule 1) whatever the change host says, so it does not wait.
 */
export function mergePending(item: FactoryItem): boolean {
  const progress = item.progress;
  return progress?.change?.merged === 'pending' && progress.running == null;
}

export function anyMergePending(items: readonly FactoryItem[]): boolean {
  return items.some(mergePending);
}

/**
 * Whether a stage's count waits on a merge answer: it holds an item that waits, or it is the
 * landed stage and any item waits (the answer may move it there). The board's columns and
 * the map's cards both ask here, so they agree.
 */
export function stageCountPending(
  stage: string,
  landedStage: string,
  held: readonly FactoryItem[],
  anyPending: boolean
): boolean {
  return (stage === landedStage && anyPending) || held.some(mergePending);
}

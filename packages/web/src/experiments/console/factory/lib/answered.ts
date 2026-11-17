/**
 * The asks an item settled lately, and the stage each settling started again. Settling the
 * last open ask a run left starts that stage again (engine #5834): the item read records the
 * settled set as an `asks_settled` answer naming the asking run, and the run it started
 * records `cause: { kind: 'asks_settled', runId }` naming the same run. Derived from reads
 * alone, so an answer given through the CLI or by an agent shows as one given here does.
 */
import type { FactoryItem } from '../../skills/factory';
import { stageOfWorkflow } from './placement';
import type { FactoryViewListed } from './views';

type Answer = FactoryItem['answers'][number];
type Settled = Extract<Answer, { kind: 'asks_settled' }>;
type RunStatus = FactoryItem['runs'][number]['status'];

/** How many settled sets the Overview lists. */
export const ANSWERED_SHOWN = 3;

export interface SettledAsks {
  itemKey: string;
  answered: number;
  withdrawn: number;
  /** When the last ask of the set closed. */
  at: string;
  /** The run the settling started; null until one has. */
  restart: {
    runId: string;
    status: RunStatus;
    /** The card the run starts on; null when the view names no stage for its workflow. */
    stageLabel: string | null;
  } | null;
}

/**
 * The asking run a run's cause names when settling that run's asks started it; null for any
 * other cause. The generated type reads this nullable union as `unknown`, so it is narrowed
 * here rather than asserted.
 */
export function asksSettledRunId(cause: unknown): string | null {
  if (typeof cause !== 'object' || cause === null || !('kind' in cause)) return null;
  if (cause.kind !== 'asks_settled' || !('runId' in cause)) return null;
  return typeof cause.runId === 'string' ? cause.runId : null;
}

function restartOf(
  view: FactoryViewListed['declaration'],
  item: FactoryItem,
  settled: Settled
): SettledAsks['restart'] {
  const run = item.runs.find(entry => asksSettledRunId(entry.cause) === settled.runId);
  if (run === undefined) return null;
  const workflow = item.progress?.runs.find(entry => entry.runId === run.id)?.workflow;
  const stage = workflow === undefined ? undefined : stageOfWorkflow(view, workflow, null);
  return { runId: run.id, status: run.status, stageLabel: stage?.label ?? null };
}

/** Every item's settled asks, newest first, the first `limit`, each with what it started. */
export function recentlySettled(
  view: FactoryViewListed['declaration'],
  items: readonly FactoryItem[],
  limit = ANSWERED_SHOWN
): SettledAsks[] {
  const all = items.flatMap(item =>
    item.answers
      .filter((answer): answer is Settled => answer.kind === 'asks_settled')
      .map(settled => ({ item, settled }))
  );
  return all
    .sort((a, b) => Date.parse(b.settled.at) - Date.parse(a.settled.at))
    .slice(0, limit)
    .map(({ item, settled }) => ({
      itemKey: item.item.key,
      answered: settled.answered,
      withdrawn: settled.withdrawn,
      at: settled.at,
      restart: restartOf(view, item, settled),
    }));
}

/**
 * The asks an item settled lately, and the stage each settling started again. Settling the
 * last open ask a run left starts that stage again (engine #5834): the item read records the
 * settled set as an `asks_settled` answer naming the asking run, and the run it started
 * records `cause: { kind: 'asks_settled', runId }` naming the same run. Derived from reads
 * alone, so an answer given through the CLI or by an agent shows as one given here does. It
 * reads the engine's item read, so it needs no factory view: with one, a run is named by its
 * stage; without, by its workflow.
 */
import type { FactoryItem } from '../../skills/factory';
import type { ItemRead } from '../../skills/items';
import { humaniseId } from '../../lib/ask-card';
import { stageOfWorkflow } from './placement';
import type { FactoryViewListed } from './views';

type Answer = ItemRead['answers'][number];
type Settled = Extract<Answer, { kind: 'asks_settled' }>;
type AskAnswer = Extract<Answer, { kind: 'ask' }>;
type RunStatus = ItemRead['runs'][number]['status'];
type Declaration = FactoryViewListed['declaration'];

/** An item as the answered read takes it: the engine's read, with the board's progress when a view applies. */
export type AnsweredSource = ItemRead & { progress?: FactoryItem['progress'] };

/** How many settled sets Needs you lists. */
export const ANSWERED_SHOWN = 3;

export interface SettledAsks {
  itemKey: string;
  /** The asking run: the run whose open asks this set closed. */
  runId: string;
  /** The item's title when the board's progress names one. */
  title: string | null;
  answered: number;
  withdrawn: number;
  /** When the last ask of the set closed. */
  at: string;
  /** When the asking run finished, which is when it asked; null when the read lacks it. */
  askedAt: string | null;
  /** The questions of the set, each with what it was answered with. */
  asks: { question: string; answer: string; withdrawn: boolean }[];
  /** The run the settling started; null until one has. */
  restart: {
    runId: string;
    status: RunStatus;
    /** The stage the run starts on when a view names it, else its workflow. */
    label: string;
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
  view: Declaration | null,
  item: AnsweredSource,
  settled: Settled
): SettledAsks['restart'] {
  const run = item.runs.find(entry => asksSettledRunId(entry.cause) === settled.runId);
  if (run === undefined) return null;
  // The view names workflows as the progress read reports them.
  const workflow = item.progress?.runs.find(entry => entry.runId === run.id)?.workflow;
  const stage =
    view === null || workflow === undefined ? undefined : stageOfWorkflow(view, workflow, null);
  return { runId: run.id, status: run.status, label: stage?.label ?? run.workflow };
}

/** What an ask was answered with, in words: the chosen option humanised, else the text. */
function answerWords(answer: AskAnswer): string {
  if (answer.withdrawn) return 'withdrawn';
  if (answer.chosen !== null)
    return answer.chosen.id === 'other' ? 'Something else' : humaniseId(answer.chosen.id);
  return 'answered';
}

function asksOf(item: AnsweredSource, settled: Settled): SettledAsks['asks'] {
  return item.answers
    .filter(
      (answer): answer is AskAnswer => answer.kind === 'ask' && answer.runId === settled.runId
    )
    .map(answer => ({
      question: answer.question,
      answer: answerWords(answer),
      withdrawn: answer.withdrawn,
    }));
}

/** Every item's settled asks, newest first, the first `limit`, each with what it started. */
export function recentlySettled(
  view: Declaration | null,
  items: readonly AnsweredSource[],
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
      runId: settled.runId,
      title: item.progress?.title ?? null,
      answered: settled.answered,
      withdrawn: settled.withdrawn,
      at: settled.at,
      askedAt: item.runs.find(run => run.id === settled.runId)?.completedAt ?? null,
      asks: asksOf(item, settled),
      restart: restartOf(view, item, settled),
    }));
}

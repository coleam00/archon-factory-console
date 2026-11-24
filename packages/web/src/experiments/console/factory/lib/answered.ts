/**
 * How an item's answers read on its page: what an ask was answered with, and the run that
 * settling a run's asks started. Settling the last open ask a run left starts that stage again
 * (engine #5834): the item read records the settled set as an `asks_settled` answer naming the
 * asking run, and the run it started records `cause: { kind: 'asks_settled', runId }` naming the
 * same run. Derived from reads alone, so an answer given through the CLI or by an agent shows as
 * one given here does. With a view a run is named by its stage; without, by its workflow.
 */
import type { FactoryItem } from '../api';
import type { ItemRead } from '../api';
import { humaniseId, shortWorkflow } from './attention';
import { stageOfWorkflow } from './placement';
import type { FactoryViewListed } from './views';

type Answer = ItemRead['answers'][number];
type AskAnswer = Extract<Answer, { kind: 'ask' }>;
type RunStatus = ItemRead['runs'][number]['status'];
type Declaration = FactoryViewListed['declaration'];

/** An item as the item page reads it: the engine's read, with the board's progress when a view applies. */
export type AnsweredSource = ItemRead & { progress?: FactoryItem['progress'] };

/** The run settling a run's asks started, named by its stage when a view names it, else by its workflow in words. */
export interface Restart {
  runId: string;
  status: RunStatus;
  label: string;
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

/** The run settling `askingRunId`'s asks started, named by its stage; null until one has. */
export function restartOf(
  view: Declaration | null,
  item: AnsweredSource,
  askingRunId: string
): Restart | null {
  const run = item.runs.find(entry => asksSettledRunId(entry.cause) === askingRunId);
  if (run === undefined) return null;
  // The view names workflows as the progress read reports them.
  const workflow = item.progress?.runs.find(entry => entry.runId === run.id)?.workflow;
  const stage =
    view === null || workflow === undefined ? undefined : stageOfWorkflow(view, workflow);
  return {
    runId: run.id,
    status: run.status,
    label: stage?.label ?? humaniseId(shortWorkflow(run.workflow)),
  };
}

/** What an ask was answered with, in words: the chosen option humanised, else the text. */
export function answerWords(answer: AskAnswer): string {
  if (answer.withdrawn) return 'withdrawn';
  if (answer.chosen !== null)
    return answer.chosen.id === 'other' ? 'Something else' : humaniseId(answer.chosen.id);
  return 'answered';
}

/**
 * Where an item stands, in a person's words (DESIGN.md, Visual standard rule 8: plain words,
 * never raw enum values, and "Merged" everywhere a person reads, never "Landed"). It reads the
 * board's own facts (`standingRun`, `chipOf`) and words them with the view file's labels: the
 * stage's label for the workflow the item stands at, and the outcome's label for an item at
 * rest. The item read carries no running step, so a running item reads as its stage running.
 */
import { chipOf, standingRun } from '../../routes/BoardPage';
import type { ItemRead } from '../../skills/items';
import type { CuratedView } from './curated-view';

/** The colour a state line takes: the state colours of the Visual standard. */
export type StateTone = 'needs-you' | 'running' | 'failed' | 'merged' | 'quiet';

export interface StateLine {
  tone: StateTone;
  text: string;
}

type Words = Pick<CuratedView, 'stageLabels' | 'outcomeLabels'>;

/** The outcome's label, by `stage:outcome` and then `stage:*`, or undefined when the file gives none. */
function outcomeLabel(view: Words, workflow: string, outcome: string | null): string | undefined {
  return (
    (outcome === null ? undefined : view.outcomeLabels[`${workflow}:${outcome}`]) ??
    view.outcomeLabels[`${workflow}:*`]
  );
}

export function itemStateLine(view: Words, read: ItemRead): StateLine {
  if (read.merged !== null) return { tone: 'merged', text: 'Merged' };
  const run = standingRun(read);
  const workflow = run?.pack?.workflow;
  const stage = workflow === undefined ? undefined : view.stageLabels[workflow];
  const at = stage ?? 'its stage';
  const ended =
    workflow === undefined ? undefined : outcomeLabel(view, workflow, run?.outcome ?? null);
  switch (chipOf(read)) {
    case 'needs_you':
      return { tone: 'needs-you', text: `Needs you at ${at}` };
    case 'running':
      return { tone: 'running', text: `${stage ?? 'A run'} is running` };
    case 'queued':
      return { tone: 'quiet', text: `Queued for ${at}` };
    case 'waiting':
      return { tone: 'quiet', text: ended ?? `Waiting at ${at}` };
    case 'failed':
      return { tone: 'failed', text: `${stage ?? 'Its run'} failed` };
    case 'stopped':
      return { tone: 'failed', text: `${stage ?? 'Its run'} was stopped` };
    case 'done':
      return { tone: 'quiet', text: ended ?? 'Ended without a change' };
    case 'resting':
      return { tone: 'quiet', text: ended ?? `At rest after ${at}` };
  }
}

/**
 * What the item page needs of one run to tell its story, beyond its facts on the board: what
 * the run said in its own words (at the view's `story.said` pointers into its result), the
 * models its steps ran on, and when each step started, so a run that works several stages
 * (a loop-form delivery) can be split across them. Placing a step on a stage is the console's
 * (`stageOfWorkflow`), so this sends the step ids as the engine records them and places none.
 */
import { resultString } from './factory-parked';
import type { FactoryView } from './schemas/factory-view';
import type { WorkflowEventRow } from './schemas/workflow-event';
import type { WorkflowEventType } from './store/event-types';
import type { WorkflowRun } from './schemas/workflow-run';
import { parseDbTimestamp } from './utils/duration';

/** The event types `factoryRunStory` reads. */
export const FACTORY_RUN_STORY_EVENT_TYPES: readonly WorkflowEventType[] = [
  'node_started',
  'node_completed',
  'workflow_completed',
];

export interface FactoryRunStory {
  /** The first non-empty string at a `story.said` pointer in the run's result; else null. */
  said: string | null;
  /** The distinct models the run's completed steps recorded, in first-recorded order. */
  models: string[];
  /** Each step start, in event order, with its time as an ISO string. */
  steps: { node: string; startedAt: string }[];
}

/** The story facts of one run, from its events of `FACTORY_RUN_STORY_EVENT_TYPES` in append order. */
export function factoryRunStory(
  view: FactoryView,
  run: WorkflowRun,
  events: readonly WorkflowEventRow[]
): FactoryRunStory {
  const said =
    (view.story?.said ?? []).map(pointer => resultString(pointer, run, events)).find(Boolean) ??
    null;
  const models: string[] = [];
  const steps: FactoryRunStory['steps'] = [];
  for (const row of events) {
    if (row.event_type === 'node_started' && row.step_name)
      steps.push({
        node: row.step_name,
        startedAt: new Date(parseDbTimestamp(row.created_at)).toISOString(),
      });
    const model = row.event_type === 'node_completed' ? row.data.model : undefined;
    if (typeof model === 'string' && model !== '' && !models.includes(model)) models.push(model);
  }
  return { said, models, steps };
}

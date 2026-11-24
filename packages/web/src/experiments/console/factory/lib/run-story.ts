/**
 * What the item page tells of one run beyond its facts on the board, from Archon's run detail
 * (`GET /api/workflows/runs/{runId}`): the models its steps ran on and when each step started,
 * so a run that works several stages can be split across them. Placing a step on a stage is
 * `stageOfWorkflow`'s, so the step ids stay as the engine records them.
 */
import { ensureUtc } from '../../lib/format';
import type { RunDetail } from '../api';
import type { FactoryItemRun } from './progress-types';

export function runStory(detail: RunDetail): Pick<FactoryItemRun, 'models' | 'steps'> {
  const models: string[] = [];
  const steps: FactoryItemRun['steps'] = [];
  for (const row of detail.events) {
    if (row.event_type === 'node_started' && row.step_name)
      steps.push({
        node: row.step_name,
        startedAt: new Date(ensureUtc(row.created_at)).toISOString(),
      });
    const model = row.event_type === 'node_completed' ? row.data.model : undefined;
    if (typeof model === 'string' && model !== '' && !models.includes(model)) models.push(model);
  }
  return { models, steps };
}

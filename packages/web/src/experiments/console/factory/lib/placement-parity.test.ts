import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stageOfWorkflow } from './placement';
import type { FactoryViewListed } from './views';

/**
 * `packages/workflows/src/__fixtures__/factory-view-step-stages.json`: the coverage check's
 * `stageOfWorkflowStep` (`check:factory-view`) places the same steps in the same stages.
 */
const fixture = JSON.parse(
  readFileSync(
    join(
      import.meta.dir,
      '../../../../../../workflows/src/__fixtures__/factory-view-step-stages.json'
    ),
    'utf8'
  )
) as {
  view: FactoryViewListed['declaration'];
  cases: { workflow: string; step: string | null; stage: string }[];
};

test('places each step as the coverage check does', () => {
  const placed = fixture.cases.map(entry => ({
    ...entry,
    stage: stageOfWorkflow(fixture.view, entry.workflow, entry.step)?.id,
  }));
  expect(placed).toEqual(fixture.cases);
});

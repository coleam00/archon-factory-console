import { describe, expect, test } from 'bun:test';
import { shippedView } from '../item-detail.test-fixtures';
import { stageOfStep, stageOfWorkflow } from './placement';

const view = shippedView;
describe('which stage a step is in', () => {
  test('a declared node, or a step inside it', () => {
    expect(stageOfStep(view, 'deliver', 'build__build')?.id).toBe('build');
    expect(stageOfStep(view, 'deliver', 'rounds.review__review')?.id).toBe('checks');
    expect(stageOfStep(view, 'deliver', 'rounds.fix')?.id).toBe('build');
    expect(stageOfStep(view, 'deliver', 'hostrounds.host__host')?.id).toBe('host');
  });

  test('a step no stage names, or one of another workflow, is in none', () => {
    expect(stageOfStep(view, 'deliver', 'rounds')).toBeUndefined();
    expect(stageOfStep(view, 'deliver', 'rounds.fixer')).toBeUndefined();
    expect(stageOfStep(view, 'plan', 'build__build')).toBeUndefined();
  });

  test("a run between steps, or in an unnamed one, is in its workflow's first stage", () => {
    expect(stageOfWorkflow(view, 'deliver', null)?.id).toBe('build');
    expect(stageOfWorkflow(view, 'deliver', 'rounds')?.id).toBe('build');
    expect(stageOfWorkflow(view, 'triage', 'anything')?.id).toBe('triage');
    expect(stageOfWorkflow(view, 'unknown', null)).toBeUndefined();
  });
});

import { describe, expect, test } from 'bun:test';
import type { FactoryWorkflow } from '../../skills/factory';
import deliverJson from './fixtures/deliver-workflow.json';
import { stepGraph } from './step-graph';
import { layoutStepGraph, type Box, type Point } from './step-graph-layout';
import { stepWorker, type FactoryStage, type StepWorker } from './stage-steps';
import { VIEW } from './board.test-fixtures';
import { stepLabel } from './step-label';

/**
 * `GET /api/factory/workflow` for the software factory pack's `deliver`, as the server
 * returned it from the installed pack, with each prompt and YAML block cut to its first line.
 */
const deliver = deliverJson as FactoryWorkflow;

// The Checks stage of the pack's factory view (.archon/packs/*.factory-view.json).
const checks = {
  nodes: [
    'rounds.base',
    'rounds.review__review',
    'rounds.tests__tests',
    'rounds.product__product',
    'rounds.verdict__verdict',
    'exhausted',
  ],
};

const NONE: StepWorker = { kind: 'none' };
// The view's stages, Checks listing the steps this fixture of deliver has.
const stages = VIEW.stages.map(stage => (stage.id === 'checks' ? { ...stage, ...checks } : stage));
const stageOf = (id: string): FactoryStage => {
  const stage = stages.find(candidate => candidate.id === id);
  if (stage === undefined) throw new Error(`the view has no stage ${id}`);
  return stage;
};
const name = (key: string): string => stepLabel(VIEW, 'deliver', key);
const graph = stepGraph(
  deliver,
  key => stepWorker(stages, stageOf('checks'), 'deliver', key),
  name
);
const groupOf = (key: string): string | null =>
  graph.nodes.find(node => node.key === key)?.group ?? null;

describe('stepGraph on deliver', () => {
  test('the rounds loop holds the fix, base and every check, each check its own include', () => {
    const group = (id: string) => graph.groups.find(candidate => candidate.id === id);
    expect(group('rounds')).toMatchObject({
      kind: 'loop',
      parent: null,
      label: 'Check rounds',
      maxRounds: 3,
    });
    expect(group('build')).toMatchObject({ kind: 'include', parent: null, label: 'build' });
    expect([groupOf('rounds.fix'), groupOf('rounds.base')]).toEqual(['rounds', 'rounds']);
    for (const check of ['review', 'tests', 'product', 'verdict']) {
      expect(groupOf(`rounds.${check}__${check}`)).toBe(`rounds.${check}`);
      expect(group(`rounds.${check}`)).toMatchObject({
        kind: 'include',
        parent: 'rounds',
        label: check,
      });
    }
    // A step reads by its name, never its engine id.
    const label = (key: string) => graph.nodes.find(node => node.key === key)?.label;
    expect([label('build__build'), label('rounds.review__review')]).toEqual([
      'Writes the change',
      'Code review',
    ]);
  });

  test('a wait on a loop runs from its last step, and the loop starts at its first', () => {
    const edges = graph.edges.map(edge => `${edge.from}→${edge.to}`);
    for (const edge of [
      'rounds.verdict__verdict→exhausted',
      'build__build→rounds.fix',
      'rounds.verdict__verdict→hostrounds.hostfix',
      'hostrounds.host__host→result',
    ])
      expect(edges).toContain(edge);
    expect(edges).not.toContain('rounds.base→exhausted');
    // build enters the loop at fix only, not at every step of it.
    expect(edges).not.toContain('build__build→rounds.base');
    expect(new Set(edges).size).toBe(edges.length);
    const keys = new Set(graph.nodes.map(node => node.key));
    for (const edge of graph.edges)
      expect([keys.has(edge.from), keys.has(edge.to)]).toEqual([true, true]);
  });

  test('a step and a loop print their when: in short, each step it reads by its name', () => {
    const condition = (key: string) => graph.nodes.find(node => node.key === key)?.condition;
    expect(condition('rounds.fix')).toBe('if Verdict = return');
    expect(condition('exhausted')).toBe('if Check rounds = return');
    expect(condition('hostrounds.hostfix')).toBe('if Reads CI and PR reviews = return');
    expect(condition('rounds.base')).toBeNull();
    expect(graph.groups.find(group => group.id === 'hostrounds')?.condition).toBe(
      'if Check rounds = approve'
    );
  });

  test('keeps and, or, inputs, other operators and an empty value', () => {
    const fix = deliver.steps.find(step => step.key === 'rounds.fix')!;
    const step = (key: string) => ({ kind: 'step' as const, key });
    const whenClauses = [
      [
        { reads: step('build__build'), operator: '!=' as const, value: '' },
        { reads: { kind: 'input' as const, name: 'mode' }, operator: '==' as const, value: 'fast' },
      ],
      [{ reads: step('rounds.tests__tests'), operator: '>=' as const, value: '80' }],
    ];
    const drawn = stepGraph({ steps: [{ ...fix, whenClauses }], groups: [] }, () => NONE, name);
    expect(drawn.nodes[0]?.condition).toBe(
      'if Writes the change ≠ empty and mode = fast or Test check ≥ 80'
    );
  });

  test('a when: the parser gave no comparisons for prints nothing; its title has it', () => {
    const fix = deliver.steps.find(step => step.key === 'rounds.fix')!;
    const bare = stepGraph(
      { steps: [{ ...fix, whenClauses: null }], groups: [] },
      () => NONE,
      name
    );
    expect(bare.nodes[0]?.condition).toBeNull();
    expect(bare.nodes[0]?.when).toBe(fix.when);
  });

  test("only the Checks stage's steps are its own", () => {
    expect(graph.nodes.filter(node => node.worker.kind === 'this').map(node => node.key)).toEqual(
      checks.nodes
    );
  });

  test('every other step names the stage that works it, from the view file', () => {
    const workers = new Map(graph.nodes.map(node => [node.key, node.worker]));
    expect(workers.get('build__build')).toEqual({
      kind: 'other',
      stage: { id: 'build', label: stageOf('build').label, group: 'build' },
    });
    expect(workers.get('hostrounds.host__host')).toMatchObject({
      kind: 'other',
      stage: { id: 'host' },
    });
    expect([...workers.values()].filter(worker => worker.kind === 'none')).toEqual([]);
  });
});

describe('layoutStepGraph on deliver', () => {
  const laid = layoutStepGraph(graph);
  const inside = (inner: Box, outer: Box): boolean =>
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height;
  const groupBox = (id: string) => laid.groups.find(group => group.group.id === id);

  test('every step lies inside its group, and every group inside its parent', () => {
    for (const step of laid.steps) {
      if (step.node.group === null) continue;
      const box = groupBox(step.node.group);
      expect(box && inside(step, box)).toBe(true);
    }
    for (const group of laid.groups) {
      if (group.group.parent === null) continue;
      const parent = groupBox(group.group.parent);
      expect(parent && inside(group, parent)).toBe(true);
    }
  });

  test('draws top to bottom: a step sits below the steps it waits on', () => {
    const top = new Map(laid.steps.map(step => [step.node.key, step.y]));
    for (const edge of laid.edges)
      expect((top.get(edge.to) ?? 0) > (top.get(edge.from) ?? 0)).toBe(true);
  });
});

describe('edges of the deliver graph keep out of frames they do not belong to', () => {
  // Every step of every stage, as the stage pages draw them.
  const laid = layoutStepGraph(stepGraph(deliver, () => NONE, name));
  const groups = new Map(laid.groups.map(group => [group.group.id, group]));
  const stepGroup = new Map(laid.steps.map(step => [step.node.key, step.node.group]));
  /** The groups a step is drawn in, innermost first. */
  const enclosing = (key: string): Set<string> => {
    const found = new Set<string>();
    for (
      let id = stepGroup.get(key) ?? null;
      id !== null;
      id = groups.get(id)?.group.parent ?? null
    )
      found.add(id);
    return found;
  };
  /** Whether the segment a→b passes inside `box`, shrunk by a tolerance for its border. */
  const crosses = (a: Point, b: Point, box: Box, tolerance = 4): boolean => {
    const left = box.x + tolerance;
    const right = box.x + box.width - tolerance;
    const top = box.y + tolerance;
    const bottom = box.y + box.height - tolerance;
    const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
    const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
    return x1 > left && x0 < right && y1 > top && y0 < bottom;
  };

  test('every edge is drawn in straight vertical and horizontal runs', () => {
    for (const edge of laid.edges)
      for (const [a, b] of edge.points.slice(1).map((p, i) => [edge.points[i], p] as const))
        expect(a !== undefined && (a.x === b.x || a.y === b.y)).toBe(true);
  });

  test('an edge enters a frame only when one of its steps is inside it', () => {
    const offending: string[] = [];
    for (const edge of laid.edges) {
      const own = new Set([...enclosing(edge.from), ...enclosing(edge.to)]);
      for (const group of laid.groups) {
        if (own.has(group.group.id)) continue;
        const hit = edge.points.slice(1).some((point, index) => {
          const before = edge.points[index];
          return before !== undefined && crosses(before, point, group);
        });
        if (hit) offending.push(`${edge.from}→${edge.to} crosses ${group.group.id}`);
      }
    }
    expect(offending).toEqual([]);
  });
});

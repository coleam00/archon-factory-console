import { describe, expect, test } from 'bun:test';
import type { FactoryWorkflow } from '../../skills/factory';
import deliverJson from './fixtures/deliver-workflow.json';
import { stepGraph } from './step-graph';
import { layoutStepGraph, type Box, type Point } from './step-graph-layout';
import { stepInStage } from './stage-steps';

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

const graph = stepGraph(deliver, key => stepInStage(checks, key));
const groupOf = (key: string): string | null =>
  graph.nodes.find(node => node.key === key)?.group ?? null;

describe('stepGraph on deliver', () => {
  test('the rounds loop is a group of up to 3 rounds holding the fix, base and every check', () => {
    expect(graph.groups.find(group => group.id === 'rounds')).toEqual({
      id: 'rounds',
      kind: 'loop',
      parent: null,
      label: 'rounds',
      maxRounds: 3,
      when: null,
      condition: null,
    });
    expect(groupOf('rounds.fix')).toBe('rounds');
    expect(groupOf('rounds.base')).toBe('rounds');
    expect(
      ['review', 'tests', 'product', 'verdict'].map(c => groupOf(`rounds.${c}__${c}`))
    ).toEqual(['rounds.review', 'rounds.tests', 'rounds.product', 'rounds.verdict']);
  });

  test('each included check is its own group inside the loop; build is one at the top', () => {
    const include = (id: string) => graph.groups.find(group => group.id === id);
    for (const check of ['review', 'tests', 'product', 'verdict'])
      expect(include(`rounds.${check}`)).toMatchObject({
        kind: 'include',
        parent: 'rounds',
        label: check,
      });
    expect(include('build')).toMatchObject({ kind: 'include', parent: null, label: 'build' });
  });

  test('a wait on a loop runs from its last step, and the loop starts at its first', () => {
    const edges = graph.edges.map(edge => `${edge.from}→${edge.to}`);
    expect(edges).toContain('rounds.verdict__verdict→exhausted');
    expect(edges).toContain('build__build→rounds.fix');
    expect(edges).toContain('rounds.verdict__verdict→hostrounds.hostfix');
    expect(edges).toContain('hostrounds.host__host→result');
    expect(edges).not.toContain('rounds.base→exhausted');
    // build enters the loop at fix only, not at every step of it.
    expect(edges).not.toContain('build__build→rounds.base');
    expect(new Set(edges).size).toBe(edges.length);
    const keys = new Set(graph.nodes.map(node => node.key));
    for (const edge of graph.edges)
      expect([keys.has(edge.from), keys.has(edge.to)]).toEqual([true, true]);
  });

  test("a step and a loop print their when: in short, from the server's short form", () => {
    const condition = (key: string) => graph.nodes.find(node => node.key === key)?.condition;
    expect(condition('rounds.fix')).toBe('if verdict = return');
    expect(condition('exhausted')).toBe('if rounds = return');
    expect(condition('rounds.base')).toBeNull();
    expect(graph.groups.find(group => group.id === 'hostrounds')?.condition).toBe(
      'if rounds = approve'
    );
  });

  test('a when: with no short form prints in full', () => {
    const [fix] = deliver.steps.filter(step => step.key === 'rounds.fix');
    if (fix === undefined) throw new Error('fixture has no rounds.fix');
    const bare = stepGraph({ steps: [{ ...fix, whenLabel: null }], groups: [] }, () => true);
    expect(bare.nodes[0]?.condition).toBe(`when ${fix.when ?? ''}`);
  });

  test('a step and a loop carry their when: condition', () => {
    const when = (key: string) => graph.nodes.find(node => node.key === key)?.when;
    expect(when('rounds.fix')).toContain('$LOOP_PREV.verdict__verdict.output.outcome');
    expect(when('exhausted')).toBe("$rounds.output.outcome == 'return'");
    expect(when('rounds.base')).toBeNull();
    expect(graph.groups.find(group => group.id === 'hostrounds')?.when).toBe(
      "$rounds.output.outcome == 'approve'"
    );
  });

  test("only the Checks stage's steps are in it", () => {
    expect(graph.nodes.filter(node => node.inStage).map(node => node.key)).toEqual(checks.nodes);
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
  const laid = layoutStepGraph(stepGraph(deliver, () => true));
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

  test('edges leaving one step leave it at different points', () => {
    const starts = new Map<string, Set<number>>();
    for (const edge of laid.edges) {
      const xs = starts.get(edge.from) ?? new Set<number>();
      xs.add(edge.points[0]?.x ?? Number.NaN);
      starts.set(edge.from, xs);
    }
    const fanOut = laid.edges.filter(edge => edge.from === 'rounds.base').length;
    expect(starts.get('rounds.base')?.size).toBe(fanOut);
  });
});

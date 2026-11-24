import { describe, expect, test } from 'bun:test';
import type { PackGraph } from '../packages/workflows/src/pack-graph';
import {
  type FactoryView,
  factoryViewSchema,
} from '../packages/workflows/src/schemas/factory-view';
import type { FactoryOverview } from '../packages/workflows/src/schemas/factory-overview';
import { checkOverviewEdges, checkViewNames } from './factory-view-names';

const node = (id: string): PackGraph['stages'][number]['nodes'][number] => ({
  id,
  kind: 'agent',
  dependsOn: [],
  loopGroup: null,
  blocks: [],
  fanOut: null,
});

const stage = (name: string, outcomes: string[], nodes: string[]): PackGraph['stages'][number] => ({
  name: `o/p:${name}`,
  returns: nodes.at(-1) ?? null,
  outcome: {
    field: 'outcome',
    form: 'enum',
    values: outcomes.map(value => ({ value, startsNothing: false })),
  },
  asks: true,
  nodes: nodes.map(node),
});

const arrow = (
  from: PackGraph['arrows'][number]['from'],
  to: string
): PackGraph['arrows'][number] => ({
  from: { ...from, stage: `o/p:${from.stage}` },
  to: `o/p:${to}`,
  linked: null,
  active: false,
  declared: { binding: 'b', problems: [] },
  installed: null,
});

/** `plan` (ends planned or ask; asks answered with `redo` start it again) hands to `build`. */
const graph: PackGraph = {
  pack: 'o.p',
  loaded: [],
  otherCopies: [],
  stages: [stage('plan', ['planned', 'ask'], ['plan']), stage('build', ['built'], ['build'])],
  arrows: [
    arrow({ stage: 'plan', outcome: 'planned' }, 'build'),
    arrow({ stage: 'plan', settled: 'answered', option: 'redo' }, 'plan'),
  ],
  fanOutBlocks: [],
  discoveryErrors: [],
};

const card = (workflow: string, step: string): object => ({
  title: step,
  text: 'Does it.',
  icon: 'pencil',
  kind: 'agent',
  covers: [{ workflow, steps: [step] }],
});

/** A view that names only what `graph` has, and places, tells, covers and labels all of it. */
const clean = {
  version: 1,
  pack: 'o/p',
  title: 'Factory',
  summary: 'Items in, changes out.',
  stages: [
    {
      id: 'plan',
      label: 'Plan',
      blurb: 'Plans.',
      group: 'intake',
      workflows: ['plan'],
      drilldown: { phases: [{ label: 'Plan', cards: [card('plan', 'plan')] }] },
    },
    {
      id: 'build',
      label: 'Build',
      blurb: 'Builds.',
      group: 'build',
      workflows: ['build'],
      drilldown: { phases: [{ label: 'Build', cards: [card('build', 'build')] }] },
    },
    { id: 'landed', label: 'Landed', blurb: 'Merged.', group: 'land', workflows: [] },
  ],
  placement: { 'plan:planned': 'build', 'plan:ask': 'plan', 'build:built': 'landed' },
  endings: {},
  landed: { stage: 'landed' },
  story: { outcomes: { 'plan:*': 'Plan ran', 'build:*': 'Build ran' } },
  answers: { 'plan:redo': { starts: 'Plans again' } },
  map: {
    cards: [],
    arrows: [
      { from: 'plan', to: 'build', label: 'planned' },
      { from: 'plan', to: 'plan', label: 'answers' },
    ],
  },
};

const check = (edit: (view: typeof clean) => object): ReturnType<typeof checkViewNames> => {
  const view: FactoryView = factoryViewSchema.parse(edit(structuredClone(clean)));
  return checkViewNames(view, graph);
};
const messages = (findings: { message: string }[]): string =>
  findings.map(f => f.message).join('\n');

describe('checkViewNames', () => {
  test('a view naming only what the graph has passes without warnings', () => {
    expect(check(view => view)).toEqual({ fails: [], warns: [] });
  });

  test('a step name the graph lacks fails', () => {
    const { fails } = check(view => ({ ...view, steps: { plan: { nope: 'Nothing' } } }));
    expect(messages(fails)).toContain('"nope"');
  });

  test('a workflow, outcome or option the graph lacks fails', () => {
    const { fails } = check(view => ({
      ...view,
      placement: { ...view.placement, 'plan:gone': 'plan' },
      answers: { 'plan:other': { starts: 'Something' } },
      stages: view.stages.map(s =>
        s.id === 'build' ? { ...s, workflows: ['build', 'ghost'] } : s
      ),
    }));
    const said = messages(fails);
    expect(said).toContain('"gone"');
    expect(said).toContain('"other"');
    expect(said).toContain('"ghost"');
  });

  test('a retired workflow is not required of the pack', () => {
    const result = check(view => ({
      ...view,
      retired: ['old'],
      stages: view.stages.map(s => (s.id === 'build' ? { ...s, workflows: ['build', 'old'] } : s)),
      placement: { ...view.placement, 'old:done': 'landed' },
      steps: { old: { gone: 'Gone' } },
    }));
    expect(result.fails).toEqual([]);
  });

  test('an unplaced outcome and an uncovered step warn without failing', () => {
    const result = check(view => {
      const { 'plan:ask': _, ...placement } = view.placement;
      return {
        ...view,
        placement,
        stages: view.stages.map(s => (s.id === 'build' ? { ...s, drilldown: undefined } : s)),
      };
    });
    expect(result.fails).toEqual([]);
    const said = messages(result.warns);
    expect(said).toContain('plan:ask');
    expect(said).toContain('build/build');
  });

  test('a label for a pair of stages the graph does not connect fails', () => {
    const { fails } = check(view => ({
      ...view,
      map: {
        ...view.map,
        arrows: [...view.map.arrows, { from: 'build', to: 'plan', label: 'back' }],
      },
    }));
    expect(messages(fails)).toContain('"build" to "plan"');
  });
});

/** A one-view overview: a card per id, opening the stage of the same name, joined by `edges`. */
const picture = (ids: string[], edges: [string, string][]): FactoryOverview => ({
  version: 1,
  pack: 'o/p',
  title: 'How it works',
  caption: 'How it works.',
  root: 'top',
  views: {
    top: {
      cards: ids.map((id, i) => ({
        id,
        title: id,
        text: id,
        icon: 'list',
        kind: 'stage',
        col: i + 1,
        row: 1,
        opens: id,
      })),
      edges: edges.map(([from, to]) => ({ from, to, kind: 'feeds' })),
    },
  },
});

describe('checkOverviewEdges', () => {
  const view = factoryViewSchema.parse(clean);

  test('an edge between two stages the graph connects passes', () => {
    expect(
      checkOverviewEdges(picture(['plan', 'build'], [['plan', 'build']]), view, graph)
    ).toEqual({
      fails: [],
      warns: [],
    });
  });

  test('an edge between two stages the graph does not connect fails', () => {
    const { fails } = checkOverviewEdges(
      picture(['plan', 'build'], [['build', 'plan']]),
      view,
      graph
    );
    expect(messages(fails)).toContain('"build" to stage "plan"');
  });

  test('a stage between two the picture draws that no card opens warns', () => {
    const { fails, warns } = checkOverviewEdges(picture(['plan', 'landed'], []), view, graph);
    expect(fails).toEqual([]);
    expect(messages(warns)).toContain('"build"');
  });
});

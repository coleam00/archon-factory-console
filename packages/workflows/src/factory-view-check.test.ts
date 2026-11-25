import { describe, expect, test } from 'bun:test';
import { checkFactoryView } from './factory-view-check';
import type { PackGraph } from './pack-graph';
import { type FactoryViewFile, factoryViewFileSchema } from './schemas/factory-view';

type Stage = PackGraph['stages'][number];

/** An installed pack's stage: qualified name, bare `workflow`, the nodes and outcomes given. */
const stage = (workflow: string, nodes: string[], outcomes: string[], inFlow = true): Stage => ({
  name: `o/p:${workflow}`,
  workflow,
  entry: false,
  roles: [],
  inFlow,
  returns: null,
  outcome: {
    field: 'outcome',
    form: 'enum',
    values: outcomes.map(value => ({ value, startsNothing: false, final: false })),
  },
  asks: false,
  waits: false,
  nodes: nodes.map(id => ({
    id,
    kind: 'prompt',
    dependsOn: [],
    loopGroup: null,
    blocks: [],
    fanOut: null,
  })),
});

const arrow = (from: string, outcome: string, to: string): PackGraph['arrows'][number] => ({
  from: { stage: `o/p:${from}`, outcome },
  to: `o/p:${to}`,
  linked: null,
  active: false,
  declared: { binding: `${from}-${outcome}`, problems: [] },
  installed: null,
});

/** plan -> build -> check, check returns to build; check is outside the document's groups. */
const graph: PackGraph = {
  pack: 'o/p',
  loaded: [],
  otherCopies: [],
  stages: [
    stage('plan', ['plan'], ['planned']),
    stage('build', ['build__build', 'end'], ['built']),
    stage('check', ['review'], ['approve', 'return']),
    stage('helper', ['help'], [], false),
  ],
  entries: [],
  document: null,
  metricViews: null,
  groups: [
    { name: 'Make', stages: ['plan', 'build'] },
    { name: 'Check', stages: ['check'] },
  ],
  capacity: [],
  settings: [],
  settingsFile: { path: '', problems: [] },
  arrows: [
    arrow('plan', 'planned', 'build'),
    arrow('build', 'built', 'check'),
    arrow('check', 'return', 'build'),
  ],
  fanOutBlocks: [],
  discoveryErrors: [],
};

const card = (id: string, workflows: string[]) => ({
  id,
  label: id,
  blurb: `${id} words`,
  workflows,
});
const opener = (id: string, col: number) => ({
  id: `hw-${id}`,
  title: id,
  text: id,
  icon: 'hammer' as const,
  kind: 'stage' as const,
  col,
  row: 1,
  opens: id,
});
const leaf = (id: string) => ({
  cards: [
    {
      id: `${id}-in`,
      title: id,
      text: id,
      icon: 'list' as const,
      kind: 'stage' as const,
      col: 1,
      row: 1,
    },
  ],
  edges: [],
});

/** A view that agrees with `graph`; each test changes one thing. */
const view = (change: Partial<FactoryViewFile> = {}): FactoryViewFile =>
  factoryViewFileSchema.parse({
    version: 1,
    title: 'P',
    summary: 'P makes things.',
    stages: [card('plan', ['plan']), card('build', ['build']), card('check', ['check'])],
    steps: { build: { build__build: 'Builds' } },
    endings: { 'plan:planned': 'Planned' },
    map: { labels: [{ from: 'check', to: 'build', label: 'returned' }] },
    howItWorks: {
      title: 'P',
      caption: 'How P runs.',
      root: 'top',
      views: {
        top: {
          cards: [opener('plan', 1), opener('build', 2), opener('check', 3)],
          edges: [
            { from: 'hw-plan', to: 'hw-build', kind: 'feeds' },
            { from: 'hw-build', to: 'hw-check', kind: 'feeds' },
            { from: 'hw-check', to: 'hw-build', kind: 'loops-back' },
          ],
        },
        plan: leaf('plan'),
        build: leaf('build'),
        check: leaf('check'),
      },
    },
    ...change,
  });

const found = (v: FactoryViewFile) =>
  checkFactoryView(v, graph).map(p => `${p.severity} ${p.path.join('.')}`);

describe('checkFactoryView', () => {
  test('a view that agrees with its graph has no problems', () => {
    expect(found(view())).toEqual([]);
  });

  test('an unknown stage name is an error', () => {
    expect(
      found(
        view({
          stages: [
            card('plan', ['plan', 'deploy']),
            card('build', ['build']),
            card('check', ['check']),
          ],
        })
      )
    ).toEqual(['error stages.0.workflows.1']);
  });

  test('a stage on no card warns that it is unplaced', () => {
    const problems = checkFactoryView(
      view({ stages: [card('plan', ['plan']), card('build', ['build'])], map: {} }),
      graph
    );
    expect(problems.map(p => [p.severity, p.message])).toContainEqual([
      'warning',
      'stage "check" is unplaced: no card holds it',
    ]);
    expect(problems.filter(p => p.severity === 'error')).toEqual([]);
  });

  test('an unknown step or outcome is an error, and a retired stage is not compared', () => {
    expect(
      found(
        view({
          retired: ['deliver'],
          steps: { build: { nope: 'Nope' }, deliver: { anything: 'Old' } },
          endings: { 'plan:gone': 'Gone', 'deliver:ready': 'Old' },
        })
      )
    ).toEqual(['error steps.build.nope', 'error endings.plan:gone']);
  });

  test('a stage on two cards, or a card across two groups, is an error', () => {
    expect(
      found(
        view({
          stages: [
            card('plan', ['plan', 'check']),
            card('build', ['build']),
            card('check', ['check']),
          ],
        })
      )
    ).toEqual(['error stages.0.workflows', 'error stages.2.workflows']);
  });

  test('a map label or How it works edge between cards the graph does not connect is an error', () => {
    const base = view();
    const top = base.howItWorks.views.top;
    expect(
      found({
        ...base,
        map: { labels: [{ from: 'check', to: 'plan', label: 'replan' }] },
        howItWorks: {
          ...base.howItWorks,
          views: {
            ...base.howItWorks.views,
            top: {
              ...top,
              edges: [...top.edges, { from: 'hw-check', to: 'hw-plan', kind: 'loops-back' }],
            },
          },
        },
      })
    ).toEqual(['error map.labels.0', 'error howItWorks.views.top.edges.3']);
  });
});

describe('factoryViewFileSchema', () => {
  test('tolerates an unknown top-level key and rejects a nested typo', () => {
    expect(factoryViewFileSchema.safeParse({ ...view(), addedLater: true }).success).toBe(true);
    const typo = { ...view(), stages: [{ ...card('plan', ['plan']), blrb: 'x' }] };
    expect(factoryViewFileSchema.safeParse(typo).success).toBe(false);
  });
});

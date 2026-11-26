import { describe, expect, test } from 'bun:test';
import { checkFactoryView, reconcileFactoryView } from './factory-view-check';
import type { PackGraph, PackGraphArrow } from './pack-graph';
import type { FactoryView } from './schemas/factory-view';

type GraphStage = PackGraph['stages'][number];

const PACK = 'acme/factory';

const stage = (
  workflow: string,
  steps: string[],
  outcomes: string[],
  inFlow = true
): GraphStage => ({
  name: `${PACK}:${workflow}`,
  workflow,
  entry: false,
  roles: [],
  inFlow,
  returns: outcomes.length === 0 ? null : 'end',
  outcome:
    outcomes.length === 0
      ? null
      : {
          field: 'outcome',
          form: 'enum',
          values: outcomes.map(value => ({ value, startsNothing: false, final: false })),
        },
  asks: false,
  waits: false,
  nodes: steps.map(id => ({
    id,
    kind: 'bash',
    dependsOn: [],
    loopGroup: null,
    blocks: [],
    fanOut: null,
  })),
});

/** A declared-only arrow: inactive, as every arrow is on a home with no trigger files. */
const arrow = (from: string, outcome: string, to: string): PackGraphArrow => ({
  from: { stage: `${PACK}:${from}`, outcome },
  to: `${PACK}:${to}`,
  linked: null,
  active: false,
  declared: { binding: `${from}-${to}`, problems: [] },
  installed: null,
});

/** make (done) -> check (pass) -> land; `helper` is included only, so never in flow. */
function graph(): PackGraph {
  return {
    pack: 'acme.factory',
    loaded: [],
    otherCopies: [],
    stages: [
      stage('make', ['write', 'end'], ['done']),
      stage('check', ['read'], ['pass', 'fail']),
      stage('land', ['merge'], []),
      stage('helper', ['help'], [], false),
    ],
    entries: [],
    document: null,
    metricViews: null,
    groups: [
      { name: 'Build', stages: ['make', 'check'] },
      { name: 'Ship', stages: ['land'] },
    ],
    capacity: [],
    settings: [],
    settingsFile: { path: '', problems: [] },
    arrows: [arrow('make', 'done', 'check'), arrow('check', 'pass', 'land')],
    fanOutBlocks: [],
    discoveryErrors: [],
  };
}

const card = (id: string, stages?: string[]) => ({
  id,
  title: id,
  text: id,
  icon: 'hammer' as const,
  kind: 'stage' as const,
  col: 1,
  row: 1,
  ...(stages === undefined ? {} : { stages }),
});

/** A view naming everything the graph has, and only that. */
function view(): FactoryView {
  const words = { label: 'x', blurb: 'x' };
  return {
    version: 1,
    title: 'Factory',
    summary: 'x',
    groups: { Build: { blurb: 'x' }, Ship: { blurb: 'x' } },
    stages: {
      make: { ...words, steps: { write: 'Writes' } },
      check: {
        ...words,
        drilldown: {
          phases: [
            {
              label: 'Read',
              cards: [{ ...card('r'), kind: 'check', icon: 'gavel', covers: ['read'] }],
            },
          ],
        },
      },
      land: words,
    },
    outcomes: { 'make:done': { story: 'Made it' }, 'land:*': { story: 'Landed' } },
    merged: 'land',
    howItWorks: {
      title: 'x',
      caption: 'x',
      root: 'top',
      views: {
        top: {
          cards: [card('a', ['make']), card('b', ['check'])],
          edges: [{ from: 'a', to: 'b', kind: 'feeds' }],
        },
      },
    },
  };
}

/** Each problem as `severity path`. */
const problems = (edit: (v: FactoryView) => void = () => undefined, g: PackGraph = graph()) => {
  const v = view();
  edit(v);
  return checkFactoryView(v, g).map(p => `${p.severity} ${p.path.join('.')}`);
};

test('a view naming only what the graph has passes clean', () => {
  expect(problems()).toEqual([]);
});

describe('a name the graph lacks drops that entry with a warning', () => {
  test.each<[string, (v: FactoryView) => void, string, (v: FactoryView) => unknown]>([
    [
      'an unknown stage',
      v => void (v.stages.deploy = { label: 'x', blurb: 'x' }),
      'warning stages.deploy',
      v => v.stages.deploy,
    ],
    ['an unknown merged stage', v => void (v.merged = 'deploy'), 'warning merged', v => v.merged],
    [
      'an unknown step',
      v => void (v.stages.make!.steps = { gone: 'x', write: 'Writes' }),
      'warning stages.make.steps.gone',
      v => v.stages.make?.steps?.gone,
    ],
    [
      'an unknown outcome',
      v => void (v.outcomes!['make:gone'] = { label: 'x' }),
      'warning outcomes.make:gone',
      v => v.outcomes?.['make:gone'],
    ],
    [
      'an exact outcome of a stage that declares none',
      v => void (v.outcomes!['land:x'] = {}),
      'warning outcomes.land:x',
      v => v.outcomes?.['land:x'],
    ],
    [
      'an option no asks arrow leaves on',
      v => void (v.answers = { 'make:drop': { starts: 'x' } }),
      'warning answers.make:drop',
      v => v.answers?.['make:drop'],
    ],
    [
      'an unknown group',
      v => void (v.groups!.Other = { blurb: 'x' }),
      'warning groups.Other',
      v => v.groups?.Other,
    ],
    [
      'a How it works edge between stages no arrow joins',
      v => void v.howItWorks.views.top!.edges.push({ from: 'b', to: 'a', kind: 'loops-back' }),
      'warning howItWorks.views.top.edges.1',
      v => v.howItWorks.views.top?.edges[1],
    ],
  ])('%s', (_name, edit, expected, entry) => {
    const v = view();
    edit(v);
    const reconciled = reconcileFactoryView(v, graph());
    expect(reconciled.problems.map(p => `${p.severity} ${p.path.join('.')}`)).toEqual([expected]);
    expect(reconciled.problems[0]?.message).toStartWith('dropped: ');
    expect(entry(reconciled.view)).toBeUndefined();
    expect(entry(v)).toBeDefined();
  });

  test('a drill-down keeps the cards that still cover a step; what is left empty goes', () => {
    const v = view();
    const phases = v.stages.check!.drilldown!.phases;
    const kept = phases[0]!.cards[0]!;
    phases[0]!.cards.push({ ...kept, title: 'gone', covers: ['gone'] });
    phases.push({ label: 'Gone', cards: [{ ...kept, covers: ['gone'] }] });
    const reconciled = reconcileFactoryView(v, graph());
    expect(reconciled.problems.map(p => p.path.join('.'))).toEqual([
      'stages.check.drilldown.phases.0.cards.1.covers.0',
      'stages.check.drilldown.phases.0.cards.1',
      'stages.check.drilldown.phases.1.cards.0.covers.0',
      'stages.check.drilldown.phases.1.cards.0',
      'stages.check.drilldown.phases.1',
    ]);
    expect(reconciled.view.stages.check?.drilldown?.phases.map(p => p.cards.length)).toEqual([1]);
  });

  test('a step two cards cover is still an error: drift does not cause it', () => {
    expect(
      problems(v => {
        const cards = v.stages.check!.drilldown!.phases[0]!.cards;
        cards.push({ ...cards[0]!, title: 'again' });
      })
    ).toEqual(['error stages.check.drilldown.phases.0.cards.1.covers.0']);
  });
});

describe('a renamed stage costs only the entries naming it', () => {
  /** `check` renamed `review`, with the same steps, outcomes, arrows and group. */
  function renamed(): PackGraph {
    const g = graph();
    for (const s of g.stages)
      if (s.workflow === 'check') Object.assign(s, { workflow: 'review', name: `${PACK}:review` });
    for (const a of g.arrows) {
      if (a.from.stage === `${PACK}:check`) a.from = { ...a.from, stage: `${PACK}:review` };
      if (a.to === `${PACK}:check`) a.to = `${PACK}:review`;
    }
    g.groups = [
      { name: 'Build', stages: ['make', 'review'] },
      { name: 'Ship', stages: ['land'] },
    ];
    return g;
  }

  test('its entries and the How it works card binding drop; the rest is served', () => {
    const v = view();
    v.outcomes!['check:fail'] = { label: 'Failed', reads: 'returned' };
    v.returns = [{ workflow: 'check', node: 'read', outcome: 'fail' }];
    v.approves = [{ workflow: 'check', node: 'read', outcome: 'pass' }];
    v.rounds = { workflow: 'check', round: '/round', allowance: '/allowance' };
    v.change = [
      { workflow: 'make', pointer: '/change' },
      { workflow: 'check', pointer: '/change' },
    ];
    const reconciled = reconcileFactoryView(v, renamed());
    expect(reconciled.problems.map(p => `${p.severity} ${p.path.join('.')}`)).toEqual([
      'warning stages.check',
      'warning outcomes.check:fail',
      'warning howItWorks.views.top.cards.1.stages.0',
      'warning returns.0.workflow',
      'warning approves.0.workflow',
      'warning rounds.workflow',
      'warning change.1.workflow',
      // `review` is in flow with neither a label here nor a `display:`.
      'warning stages',
    ]);
    const served = reconciled.view;
    expect(Object.keys(served.stages)).toEqual(['make', 'land']);
    expect(served.howItWorks.views.top?.cards[1]?.stages).toBeUndefined();
    expect(served.howItWorks.views.top?.edges).toHaveLength(1);
    expect(served.returns).toBeUndefined();
    expect(served.approves).toBeUndefined();
    expect(served.rounds).toBeUndefined();
    expect(served.change).toEqual([{ workflow: 'make', pointer: '/change' }]);
    expect(served.groups).toEqual(v.groups);
    expect(served.merged).toBe('land');
  });

  test('a drop that leaves one half of "returned" alone drops the other half', () => {
    const v = view();
    v.outcomes!['make:done'] = { story: 'Made it', reads: 'returned' };
    v.returns = [
      { workflow: 'make', node: 'write', outcome: 'done' },
      { workflow: 'make', node: 'gone', outcome: 'done' },
    ];
    // Only the second point names a step the graph lacks: the first still counts.
    expect(reconcileFactoryView(v, graph()).problems.map(p => p.path.join('.'))).toEqual([
      'returns.1.node',
    ]);
    v.returns = [{ workflow: 'make', node: 'gone', outcome: 'done' }];
    const orphaned = reconcileFactoryView(v, graph());
    expect(orphaned.problems.map(p => `${p.severity} ${p.path.join('.')}`)).toEqual([
      'warning returns.0.node',
      'warning outcomes.make:done.reads',
    ]);
    expect(orphaned.view.outcomes?.['make:done']).toEqual({ story: 'Made it' });
  });
});

test('a calls edge asks someone and is not compared with the arrows', () => {
  expect(
    problems(v => void v.howItWorks.views.top!.edges.push({ from: 'b', to: 'a', kind: 'calls' }))
  ).toEqual([]);
});

describe('what the graph has and the view leaves out warns', () => {
  test('an in-flow stage with no words', () => {
    expect(problems(v => void delete v.stages.land)).toEqual(['warning stages']);
  });

  test('a stage whose entry holds only a drill-down has no words, unless its display: gives a label', () => {
    const drilldownOnly = (v: FactoryView) => {
      const { drilldown } = v.stages.check ?? {};
      v.stages.check = drilldown === undefined ? {} : { drilldown };
    };
    expect(problems(drilldownOnly)).toEqual(['warning stages']);
    const g = graph();
    for (const s of g.stages) if (s.workflow === 'check') s.display = { label: 'Check' };
    expect(problems(drilldownOnly, g)).toEqual([]);
  });

  test('a group with no words', () => {
    expect(problems(v => void delete v.groups!.Ship)).toEqual(['warning groups']);
  });

  test("a pack that declares no groups drops the file's group words", () => {
    expect(reconcileFactoryView(view(), { ...graph(), groups: [] }).view.groups).toEqual({});
    expect(problems(undefined, { ...graph(), groups: [] })).toEqual([
      'warning groups.Build',
      'warning groups.Ship',
    ]);
  });

  test('a stage that is not in flow is not warned on', () => {
    const g = graph();
    expect(g.stages.some(s => s.workflow === 'helper' && !s.inFlow)).toBe(true);
    expect(problems(undefined, g)).toEqual([]);
  });
});

describe('progress declarations are reconciled with the graph', () => {
  /** `check` with a loop group `rounds` holding `rounds.judge`. */
  function loopGraph(): PackGraph {
    const g = graph();
    const check = g.stages.find(s => s.workflow === 'check');
    const node = { kind: 'bash', dependsOn: [], blocks: [], fanOut: null };
    check?.nodes.push(
      { ...node, id: 'rounds', loopGroup: null },
      { ...node, id: 'rounds.judge', loopGroup: 'rounds' }
    );
    return g;
  }
  /** Returns and approvals on check's judge, rounds from its loop, the change from make and an old `deliver`. */
  const declared = (v: FactoryView): void => {
    v.outcomes!['check:fail'] = { reads: 'returned' };
    v.retired = ['deliver'];
    v.rounds = [
      { workflow: 'check', loop: 'rounds' },
      { workflow: 'deliver', loop: 'anything' },
    ];
    v.returns = [
      { workflow: 'check', node: 'rounds.judge', outcome: 'fail' },
      { workflow: 'deliver', node: 'gone.step', outcome: 'return' },
    ];
    v.approves = [{ workflow: 'check', node: 'rounds.judge', outcome: 'pass' }];
    v.change = [
      { workflow: 'make', pointer: '/change' },
      { workflow: 'deliver', pointer: '/change' },
    ];
  };
  const checked = (edit: (v: FactoryView) => void) =>
    problems(v => {
      declared(v);
      edit(v);
    }, loopGraph());

  test('a valid declaration passes, a retired workflow unchecked', () => {
    expect(checked(() => undefined)).toEqual([]);
  });

  test.each<[string, (v: FactoryView) => void, string[]]>([
    [
      'an unknown workflow',
      v => void v.approves?.push({ workflow: 'ship', node: 'x', outcome: 'y' }),
      ['warning approves.1.workflow'],
    ],
    [
      'an unknown step',
      v => void (v.approves = [{ workflow: 'check', node: 'judge', outcome: 'pass' }]),
      ['warning approves.0.node'],
    ],
    [
      'an unknown loop',
      v => void (v.rounds = { workflow: 'check', loop: 'laps' }),
      ['warning rounds.loop'],
    ],
  ])('%s is dropped', (_name, edit, expected) => {
    expect(checked(edit)).toEqual(expected);
  });

  test.each<[string, (v: FactoryView) => void, string[]]>([
    ['a retired workflow the graph has', v => void v.retired?.push('land'), ['error retired.1']],
    ['a workflow retired twice', v => void v.retired?.push('deliver'), ['error retired.1']],
    [
      'a source naming one workflow twice',
      v =>
        void (v.change = [
          { workflow: 'make', pointer: '/a' },
          { workflow: 'make', pointer: '/b' },
        ]),
      ['error change.1'],
    ],
    [
      'an outcome read as returned that no return point counts',
      v => void (v.outcomes!['make:done'] = { reads: 'returned' }),
      ['error outcomes.make:done'],
    ],
    [
      'a return point on a stage none of whose outcomes reads returned',
      v => void delete v.outcomes!['check:fail'],
      ['error returns.0.workflow'],
    ],
  ])('%s is an error: the file says it as written', (_name, edit, expected) => {
    expect(checked(edit)).toEqual(expected);
  });
});

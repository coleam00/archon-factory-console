import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  factoryViewCoverage,
  stageOfWorkflowStep,
  unlistedWorkflows,
} from './factory-view-coverage';
import { packGraphSchema, type PackGraph } from './pack-graph';
import { factoryViewSchema, type FactoryView } from './schemas/factory-view';

type Node = PackGraph['stages'][number]['nodes'][number];
type Arrow = PackGraph['arrows'][number];

const node = (id: string, kind = 'agent', loopGroup: string | null = null): Node => ({
  id,
  kind,
  dependsOn: [],
  loopGroup,
  blocks: [],
  fanOut: null,
});

const arrow = (
  from: string,
  to: string,
  when: { outcome: string } | { settled: 'answered' | 'withdrawn' | 'any'; option?: string }
): Arrow => ({
  from: { stage: `o/p:${from}`, ...when },
  to: `o/p:${to}`,
  linked: null,
  active: false,
  declared: { binding: `${from}-${to}`, problems: [] },
  installed: null,
});

/**
 * An installed pack's graph: `plan` hands to `deliver`, whose steps two stages split; deliver
 * returns from `result`, which the Ship stage names; plan's answered asks start plan again.
 */
const graph = (): PackGraph => ({
  pack: 'o.p',
  loaded: [],
  otherCopies: [],
  stages: [
    { name: 'o/p:plan', returns: 'plan', outcome: null, asks: true, nodes: [node('plan')] },
    {
      name: 'o/p:deliver',
      returns: 'result',
      outcome: null,
      asks: false,
      nodes: [
        node('build__build'),
        node('rounds', 'loop_group'),
        node('rounds.review__review', 'agent', 'rounds'),
        node('result', 'exec'),
      ],
    },
    {
      name: 'o/p:discoveries',
      returns: 'drain',
      outcome: null,
      asks: false,
      nodes: [node('drain')],
    },
  ],
  arrows: [
    arrow('plan', 'deliver', { outcome: 'planned' }),
    arrow('plan', 'plan', { settled: 'answered' }),
    // Into a workflow no stage lists: not between stages.
    arrow('deliver', 'discoveries', { outcome: 'ready' }),
  ],
  fanOutBlocks: [],
  discoveryErrors: [],
});

const card = (workflow: string, ...steps: string[]) => ({
  title: steps[0] ?? workflow,
  text: 'Does it.',
  icon: 'pencil' as const,
  kind: 'agent' as const,
  covers: [{ workflow, steps }],
});

/** A view that covers every step of `graph()` once and declares each of its hand-offs. */
const clean = (): FactoryView =>
  factoryViewSchema.parse({
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
        workflows: ['deliver'],
        nodes: ['build__build', 'rounds'],
        drilldown: {
          phases: [
            { label: 'Write', cards: [card('deliver', 'build__build')] },
            { label: 'Check', cards: [card('deliver', 'rounds.review__review')] },
          ],
          loop: { label: 'Up to 3 rounds', from: 2, to: 2, workflow: 'deliver', step: 'rounds' },
        },
      },
      {
        id: 'ship',
        label: 'Ship',
        blurb: 'Ships.',
        group: 'land',
        workflows: ['deliver'],
        nodes: ['result'],
        drilldown: { phases: [{ label: 'Hand off', cards: [card('deliver', 'result')] }] },
      },
      { id: 'landed', label: 'Landed', blurb: 'Merged.', group: 'land', workflows: [] },
    ],
    placement: {},
    endings: {},
    landed: { stage: 'landed' },
    steps: { deliver: { build__build: 'Writes the change' } },
    map: {
      cards: [],
      arrows: [
        { from: 'plan', to: 'build', label: 'planned' },
        { from: 'plan', to: 'plan', label: 'asks answered' },
        { from: 'build', to: 'ship' },
        { from: 'ship', to: 'landed' },
      ],
    },
  });

type Drilldown = NonNullable<FactoryView['stages'][number]['drilldown']>;
const drilldownOf = (view: FactoryView, stage: number): Drilldown => {
  const found = view.stages[stage]?.drilldown;
  if (found === undefined) throw new Error(`stage ${String(stage)} has no drill-down`);
  return found;
};

const findings = (view: FactoryView, of: PackGraph = graph()) =>
  factoryViewCoverage(view, of).map(finding => [finding.kind, finding.path.join('.')]);

describe('factoryViewCoverage', () => {
  test('a view covering every step once and declaring every hand-off has no findings', () => {
    expect(factoryViewCoverage(clean(), graph())).toEqual([]);
  });

  test('a step no card covers, and a step two cards cover, are each reported', () => {
    const view = clean();
    // Drop the result card: `result` is covered by none. Cover the review step again.
    drilldownOf(view, 2).phases[0]!.cards[0] = card('deliver', 'rounds.review__review');
    expect(findings(view)).toEqual([
      ['covered-twice', 'stages.2.drilldown.phases.0.cards.0.covers.0.steps.0'],
      // Reported at the stage the step counts in.
      ['uncovered', 'stages.2.drilldown'],
    ]);
  });

  test('a card covering an unknown step is reported with its path', () => {
    const view = clean();
    drilldownOf(view, 1).phases[0]!.cards[0]!.covers[0]!.steps.push('rounds.reveiw');
    expect(findings(view)).toEqual([
      ['unknown-step', 'stages.1.drilldown.phases.0.cards.0.covers.0.steps.1'],
    ]);
  });

  test('a loop must name a loop group', () => {
    const view = clean();
    drilldownOf(view, 1).loop!.step = 'build__build';
    // The loop group `rounds` is then covered by nothing.
    expect(findings(view)).toEqual([
      ['unknown-step', 'stages.1.drilldown.loop.step'],
      ['uncovered', 'stages.1.drilldown'],
    ]);
  });

  test('a step name, a verdicts step or a stage node naming no real step is reported', () => {
    const view = clean();
    view.steps = { deliver: { build__biuld: 'Writes the change' } };
    view.verdicts = { deliver: { 'rounds.reveiw__review': { approve: 'approved' } } };
    view.stages[2]!.nodes = ['result', 'reslut'];
    expect(findings(view)).toEqual([
      ['unknown-step', 'stages.2.nodes.1'],
      ['unknown-step', 'steps.deliver.build__biuld'],
      ['unknown-step', 'verdicts.deliver.rounds.reveiw__review'],
    ]);
  });

  test('rounds in both forms, a change list, returns and approves on real steps have no findings', () => {
    const view = clean();
    view.rounds = [
      { workflow: 'deliver', loop: 'rounds' },
      { workflow: 'plan', round: '/round', allowance: '/allowance' },
    ];
    view.change = [
      { workflow: 'deliver', pointer: '/change' },
      { workflow: 'plan', pointer: '/change' },
    ];
    view.returns = [{ workflow: 'deliver', node: 'rounds.review__review', outcome: 'return' }];
    view.approves = [{ workflow: 'plan', node: 'plan', outcome: 'approve' }];
    expect(findings(view)).toEqual([]);
  });

  test('a rounds loop that is no loop group, a return on no real step, are reported', () => {
    const view = clean();
    view.rounds = { workflow: 'deliver', loop: 'build__build' };
    view.returns = [{ workflow: 'deliver', node: 'rounds.verdict', outcome: 'return' }];
    view.approves = [{ workflow: 'plan', node: 'planner', outcome: 'approve' }];
    expect(findings(view)).toEqual([
      ['unknown-step', 'returns.0.node'],
      ['unknown-step', 'approves.0.node'],
      ['unknown-step', 'rounds.loop'],
    ]);
  });

  test('a stage-form rounds source or a change source on a workflow that returns nothing is reported', () => {
    const view = clean();
    const of = graph();
    of.stages[0]!.returns = null;
    view.rounds = [
      { workflow: 'deliver', loop: 'rounds' },
      { workflow: 'plan', round: '/round', allowance: '/allowance' },
    ];
    view.change = { workflow: 'plan', pointer: '/change' };
    expect(findings(view, of)).toEqual([
      ['no-result', 'rounds.1.workflow'],
      ['no-result', 'change.workflow'],
    ]);
  });

  test('a workflow the pack does not have, and a graph that failed to load, are reported', () => {
    const view = clean();
    view.stages[0]!.workflows = ['plan', 'replan'];
    const broken = graph();
    broken.discoveryErrors = [{ filename: 'x.yaml', workflowName: null, error: 'bad' }];
    expect(findings(view, broken)).toEqual([
      ['graph-incomplete', ''],
      ['unknown-workflow', 'stages.0.workflows.1'],
    ]);
  });

  test('a discoveries workflow the pack does not have is reported; one it has is not', () => {
    const view = clean();
    const discoveries = {
      workflow: 'discoveries',
      shadow: true,
      filed: '/filed',
      held: '/held',
      dropped: '/dropped',
      entry: { title: '/title' },
    };
    view.discoveries = discoveries;
    expect(findings(view)).toEqual([]);
    view.discoveries = { ...discoveries, workflow: 'discovery' };
    expect(findings(view)).toEqual([['unknown-workflow', 'discoveries.workflow']]);
  });

  test('a shadow naming a step or a workflow the pack does not have is reported', () => {
    const view = clean();
    const shadow = (workflow: string, node: string) => ({
      workflow,
      node,
      label: 'Would it',
      reads: 'verdict' as const,
      pointer: '/verdict',
      words: { yes: 'would' },
    });
    // The discoveries workflow resolves, though no stage lists it.
    view.shadows = [shadow('deliver', 'rounds.review__review'), shadow('discoveries', 'drain')];
    expect(findings(view)).toEqual([]);
    view.shadows = [
      shadow('deliver', 'rounds.checks'),
      shadow('triage', 'admit'),
      shadow('discoveries', 'drain'),
    ];
    const found = factoryViewCoverage(view, graph()).filter(entry => entry.path[0] === 'shadows');
    expect(found.map(entry => [entry.kind, entry.path.join('.')])).toEqual([
      ['unknown-step', 'shadows.0.node'],
      ['unknown-workflow', 'shadows.1.workflow'],
    ]);
    expect(found[0]?.message).toBe(
      'names step "rounds.checks", which workflow "deliver" does not have'
    );
  });

  test('a hand-off the pack starts and the view does not declare is reported', () => {
    const view = clean();
    view.map.arrows = view.map.arrows.filter(entry => entry.from !== entry.to);
    const found = factoryViewCoverage(view, graph());
    expect(found.map(finding => [finding.kind, finding.path.join('.')])).toEqual([
      ['undeclared-hand-off', 'map.arrows'],
    ]);
    expect(found[0]?.message).toContain('"plan" to "plan" (asks answered)');
  });

  test('a declared arrow between workflows that no hand-off backs is reported', () => {
    const view = clean();
    view.map.arrows.push({ from: 'ship', to: 'plan', label: 'replan', back: true });
    expect(findings(view)).toEqual([['unbacked-arrow', 'map.arrows.4']]);
  });

  test('a person step, an arrow within one workflow and one into landed need no hand-off', () => {
    const view = clean();
    view.map.arrows.push(
      { from: 'ship', to: 'plan', label: 'replan', back: true, person: true },
      { from: 'ship', to: 'build', label: 'returned', back: true },
      { from: 'plan', to: 'landed' }
    );
    expect(findings(view)).toEqual([]);
  });
});

/** `graph()` with plan declaring the outcomes a run of it completes with. */
const withPlanOutcomes = (...values: string[]): PackGraph => {
  const of = graph();
  const plan = of.stages[0];
  if (plan === undefined) throw new Error('graph() has no plan stage');
  plan.outcome = {
    field: 'outcome',
    form: 'enum',
    values: values.map(value => ({ value, startsNothing: false })),
  };
  return of;
};

describe('outcomes: each one placed or ended, and only declared ones named', () => {
  test('a view that places, ends or parks every declared outcome has no findings', () => {
    const view = {
      ...clean(),
      placement: { 'plan:planned': 'build', 'plan:park': 'plan' },
      endings: { 'plan:stop': 'Stopped at planning' },
      parked: { 'plan:park': { label: 'Parked' } },
      asked: ['plan:planned'],
    };
    expect(findings(view, withPlanOutcomes('planned', 'park', 'stop'))).toEqual([]);
  });

  test('a declared outcome neither placed nor ended is reported, one finding each', () => {
    const view = { ...clean(), placement: { 'plan:planned': 'build' } };
    expect(findings(view, withPlanOutcomes('planned', 'park', 'stop'))).toEqual([
      ['unplaced-outcome', 'placement'],
      ['unplaced-outcome', 'placement'],
    ]);
  });

  test('workflow:* in placement or endings takes every outcome', () => {
    const of = withPlanOutcomes('planned', 'park', 'stop');
    expect(findings({ ...clean(), placement: { 'plan:*': 'plan' } }, of)).toEqual([]);
    expect(findings({ ...clean(), endings: { 'plan:*': 'Stopped' } }, of)).toEqual([]);
  });

  test('an exact key naming an outcome the workflow does not declare is reported at its path', () => {
    const view = {
      ...clean(),
      placement: { 'plan:planned': 'build', 'plan:parked': 'plan' },
      endings: { 'plan:closed': 'Closed' },
      parked: { 'plan:parked': { label: 'Parked' } },
      awaits: { 'plan:shaped': { label: 'Needs shaping' } },
      asked: ['plan:asked'],
    };
    expect(findings(view, withPlanOutcomes('planned'))).toEqual([
      ['unknown-outcome', 'placement.plan:parked'],
      ['unknown-outcome', 'endings.plan:closed'],
      ['unknown-outcome', 'parked.plan:parked'],
      ['unknown-outcome', 'awaits.plan:shaped'],
      ['unknown-outcome', 'asked.0'],
    ]);
  });

  test('an awaits outcome is placed through placement, so it needs no ending', () => {
    const view = {
      ...clean(),
      placement: { 'plan:planned': 'build', 'plan:shape': 'plan' },
      awaits: { 'plan:shape': { label: 'Needs shaping', questions: '/open_questions' } },
    };
    expect(findings(view, withPlanOutcomes('planned', 'shape'))).toEqual([]);
  });

  test('a workflow that declares no outcome is not compared', () => {
    const view = { ...clean(), placement: { 'deliver:anything': 'ship' } };
    expect(findings(view)).toEqual([]);
  });
});

/** `graph()` after the pack dropped `deliver`: its stage and every arrow touching it gone. */
const withoutDeliver = (): PackGraph => {
  const of = graph();
  of.stages = of.stages.filter(stage => stage.name !== 'o/p:deliver');
  of.arrows = of.arrows.filter(
    entry => entry.from.stage !== 'o/p:deliver' && entry.to !== 'o/p:deliver'
  );
  return of;
};

/**
 * `clean()` with `deliver` retired, still worded everywhere for its old runs: placed, ended,
 * told, its steps named and a step of it a shadow. The plan -> build arrow only deliver backed
 * is gone, as the view's author would drop it.
 */
const retiredView = (): FactoryView => {
  const view = clean();
  return factoryViewSchema.parse({
    ...view,
    retired: ['deliver'],
    placement: { 'deliver:ready': 'ship', 'deliver:returned': 'build' },
    endings: { 'deliver:stop': 'Stopped' },
    asked: ['deliver:ask'],
    returns: [{ workflow: 'deliver', node: 'rounds.review__review', outcome: 'return' }],
    verdicts: { deliver: { 'rounds.review__review': { sound: 'approved' } } },
    rounds: { workflow: 'deliver', loop: 'rounds' },
    change: { workflow: 'deliver', pointer: '/change' },
    story: {
      outcomes: { 'deliver:ready': 'Delivered', 'deliver:*': 'Deliver finished' },
      steps: { deliver: { 'rounds.review__review': 'The checks read it' } },
    },
    shadows: [
      {
        workflow: 'deliver',
        node: 'rounds.checks',
        label: 'Project checks',
        reads: 'checks',
        results: '/results',
        entry: { name: '/name', passed: '/passed' },
      },
    ],
    map: {
      ...view.map,
      arrows: view.map.arrows.filter(entry => entry.from !== 'plan' || entry.to !== 'build'),
    },
  });
};

describe('retired workflows: kept for their old runs, compared with nothing', () => {
  test('a retired workflow the pack no longer has yields no finding anywhere the view names it', () => {
    expect(findings(retiredView(), withoutDeliver())).toEqual([]);
  });

  test('the same view without retired reports the workflow the pack lacks', () => {
    const view = { ...retiredView(), retired: undefined };
    expect(findings(view, withoutDeliver())).toEqual([
      ['unknown-workflow', 'stages.1.workflows.0'],
      ['unknown-workflow', 'stages.2.workflows.0'],
      ['unknown-step', 'stages.1.nodes.0'],
      ['unknown-step', 'stages.1.nodes.1'],
      ['unknown-step', 'stages.2.nodes.0'],
      ['unknown-workflow', 'shadows.0.workflow'],
    ]);
  });

  test('a stage node naming no step the view records for a retired workflow is still reported', () => {
    const view = retiredView();
    view.stages[1]!.nodes = ['build__build', 'rounds', 'rounds.fixx'];
    expect(findings(view, withoutDeliver())).toEqual([['unknown-step', 'stages.1.nodes.2']]);
  });

  test('a retired workflow the pack still has is reported, and nothing of it is compared', () => {
    const found = factoryViewCoverage(retiredView(), graph());
    expect(found.map(entry => [entry.kind, entry.path.join('.')])).toEqual([
      ['retired-present', 'retired.0'],
    ]);
    expect(found[0]?.message).toBe(
      'names retired workflow "deliver", which pack "o.p" still has; remove it from retired or stop retiring it'
    );
  });
});

/** `clean()` wording what the given `workflow:option` keys start. */
const answering = (...keys: string[]): FactoryView =>
  factoryViewSchema.parse({
    ...clean(),
    answers: Object.fromEntries(keys.map(key => [key, { starts: 'Closes the PR.' }])),
  });

/** `graph()` with plan's answered-asks arrow settled `when` instead. */
const planAsks = (when: { settled: 'answered' | 'withdrawn'; option?: string }): PackGraph => {
  const of = graph();
  of.arrows = of.arrows.map(entry =>
    'settled' in entry.from ? arrow('plan', 'plan', when) : entry
  );
  return of;
};

describe('answers: each key backed by an asks-settled hand-off on its option', () => {
  const drop = planAsks({ settled: 'answered', option: 'drop' });

  test('a key whose workflow has an asks-settled hand-off on its option yields nothing', () => {
    expect(findings(answering('plan:drop'), drop)).toEqual([]);
  });

  test('a key on an option no hand-off of its workflow leaves on is reported', () => {
    const found = factoryViewCoverage(answering('plan:reshape'), drop);
    expect(found.map(entry => [entry.kind, entry.path.join('.')])).toEqual([
      ['unbacked-answer', 'answers.plan:reshape'],
    ]);
    expect(found[0]?.message).toBe(
      'words what option "reshape" of workflow "plan" starts, but no asks-settled hand-off of the pack leaves it on that option'
    );
  });

  test('a key on a workflow with no asks-settled hand-off is reported', () => {
    expect(findings(answering('deliver:drop'), drop)).toEqual([
      ['unbacked-answer', 'answers.deliver:drop'],
    ]);
  });

  test('a hand-off with no option backs every option, unless it is on withdrawn asks', () => {
    expect(findings(answering('plan:anything'))).toEqual([]);
    expect(findings(answering('plan:anything'), planAsks({ settled: 'withdrawn' }))).toEqual([
      ['unbacked-answer', 'answers.plan:anything'],
    ]);
  });

  test('a key on a retired workflow is not compared', () => {
    const view = factoryViewSchema.parse({
      ...retiredView(),
      answers: { 'deliver:drop': { starts: 'Closes the PR.' } },
    });
    expect(findings(view, withoutDeliver())).toEqual([]);
  });
});

describe('story: every declared outcome told, and only real outcomes and steps named', () => {
  const placed = { 'plan:planned': 'build', 'plan:stop': 'plan' };

  test('a story telling every outcome, exactly or by workflow:*, has no findings', () => {
    const of = withPlanOutcomes('planned', 'stop');
    const exact = { outcomes: { 'plan:planned': 'Plan wrote it', 'plan:stop': 'Plan stopped' } };
    expect(findings({ ...clean(), placement: placed, story: exact }, of)).toEqual([]);
    const star = { outcomes: { 'plan:*': 'Plan finished' } };
    expect(findings({ ...clean(), placement: placed, story: star }, of)).toEqual([]);
  });

  test('a declared outcome with no sentence is reported; a view with no story is not', () => {
    const of = withPlanOutcomes('planned', 'stop');
    const story = { outcomes: { 'plan:planned': 'Plan wrote it' } };
    expect(findings({ ...clean(), placement: placed, story }, of)).toEqual([
      ['untold-outcome', 'story.outcomes'],
    ]);
    expect(findings({ ...clean(), placement: placed }, of)).toEqual([]);
  });

  test('an unknown outcome key and an unknown step are reported at their paths', () => {
    const story = {
      outcomes: { 'plan:*': 'Plan finished', 'plan:parked': 'Plan parked it' },
      steps: { deliver: { build__build: 'Build wrote it', 'rounds.nope': 'Nothing' } },
    };
    expect(
      findings({ ...clean(), placement: placed, story }, withPlanOutcomes('planned', 'stop'))
    ).toEqual([
      ['unknown-outcome', 'story.outcomes.plan:parked'],
      ['unknown-step', 'story.steps.deliver.rounds.nope'],
    ]);
  });
});

describe('arrows back into their own stage, and arrows touching landed', () => {
  test('a declared loop the pack no longer starts is reported', () => {
    const stale = graph();
    stale.arrows = stale.arrows.filter(entry => entry.to !== 'o/p:plan' || 'outcome' in entry.from);
    expect(findings(clean(), stale)).toEqual([['unbacked-arrow', 'map.arrows.1']]);
  });

  test('a loop on a stage whose workflow has other stages is not exempt as a step', () => {
    const view = clean();
    view.map.arrows.push({ from: 'build', to: 'build', label: 'again' });
    expect(findings(view)).toEqual([['unbacked-arrow', 'map.arrows.4']]);
  });

  test('only an arrow into landed from another stage is exempt', () => {
    const view = clean();
    view.map.arrows.push({ from: 'landed', to: 'plan' }, { from: 'landed', to: 'landed' });
    expect(findings(view)).toEqual([
      ['unbacked-arrow', 'map.arrows.4'],
      ['unbacked-arrow', 'map.arrows.5'],
    ]);
  });
});

describe('where a hand-off leaves from', () => {
  test("from the stage whose nodes name the run's return step, not the workflow's first stage", () => {
    const withReplan = graph();
    withReplan.arrows.push(arrow('deliver', 'plan', { outcome: 'replan' }));
    const found = factoryViewCoverage(clean(), withReplan);
    expect(found.map(finding => finding.kind)).toEqual(['undeclared-hand-off']);
    expect(found[0]?.message).toContain('from "ship" to "plan" (replan)');
  });
});

describe('stageOfWorkflowStep', () => {
  /** `__fixtures__/factory-view-step-stages.json`: the web console's placement test reads it too. */
  const fixture = JSON.parse(
    readFileSync(join(import.meta.dir, '__fixtures__', 'factory-view-step-stages.json'), 'utf8')
  ) as { view: unknown; cases: { workflow: string; step: string | null; stage: string }[] };

  test('places each step as the web console does', () => {
    const view = factoryViewSchema.parse(fixture.view);
    const placed = fixture.cases.map(entry => ({
      ...entry,
      stage: stageOfWorkflowStep(view, entry.workflow, entry.step)?.id,
    }));
    expect(placed).toEqual(fixture.cases);
  });
});

describe('unlistedWorkflows', () => {
  test('names the workflows no stage lists, by their names in the graph', () => {
    expect(unlistedWorkflows(clean(), graph())).toEqual(['o/p:discoveries']);
  });

  test('is empty when the stages list every workflow', () => {
    const view = clean();
    view.stages[0]?.workflows.push('discoveries');
    expect(unlistedWorkflows(view, graph())).toEqual([]);
  });

  test('a workflow the view names but the pack lacks changes nothing', () => {
    const view = clean();
    view.stages[0]?.workflows.push('missing');
    expect(unlistedWorkflows(view, graph())).toEqual(['o/p:discoveries']);
  });
});

describe("this repository's declaration", () => {
  test('covers every step and hand-off of the workflows its stages list, against the committed snapshot', () => {
    const packs = join(import.meta.dir, '..', '..', '..', '.archon', 'packs');
    const read = (file: string): unknown =>
      JSON.parse(readFileSync(join(packs, `Wirasm.archon-software-factory${file}`), 'utf8'));
    const view = factoryViewSchema.parse(read('.factory-view.json'));
    const snapshot = packGraphSchema.parse(read('.pack-graph.json'));
    expect(factoryViewCoverage(view, snapshot)).toEqual([]);
  });
});

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
  when: { outcome: string } | { settled: 'answered' }
): Arrow => ({
  from: { stage: `o/p:${from}`, ...when },
  to: `o/p:${to}`,
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
  icon: 'pencil',
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

  test('a step name or a stage node naming no real step is reported', () => {
    const view = clean();
    view.steps = { deliver: { build__biuld: 'Writes the change' } };
    view.stages[2]!.nodes = ['result', 'reslut'];
    expect(findings(view)).toEqual([
      ['unknown-step', 'stages.2.nodes.1'],
      ['unknown-step', 'steps.deliver.build__biuld'],
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

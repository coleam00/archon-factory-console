import { describe, expect, test } from 'bun:test';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { factoryViewSchema, type FactoryView } from './factory-view';

/** The declaration this repository ships for its own factory, as a project file. */
const SHIPPED = join(
  import.meta.dir,
  '../../../../.archon/packs/Wirasm.archon-software-factory.factory-view.json'
);

const minimal = (): FactoryView => ({
  version: 1,
  pack: 'factory',
  title: 'Factory',
  summary: 'Items in, changes out.',
  stages: [
    { id: 'plan', label: 'Plan', blurb: 'Plans.', group: 'intake', workflows: ['plan'] },
    { id: 'build', label: 'Build', blurb: 'Builds.', group: 'build', workflows: ['build'] },
    { id: 'landed', label: 'Landed', blurb: 'Merged.', group: 'land', workflows: [] },
  ],
  placement: { 'plan:planned': 'build' },
  endings: { 'plan:*': 'Stopped' },
  landed: { stage: 'landed' },
  map: {
    cards: [{ stage: 'plan' }, { stage: 'build' }],
    arrows: [{ from: 'build', to: 'landed', label: 'merged' }],
    notes: [{ text: 'You answer asks here', near: 'needs-you' }],
  },
});

type Drilldown = NonNullable<FactoryView['stages'][number]['drilldown']>;
type Card = Drilldown['phases'][number]['cards'][number];

const card = (title: string, steps: string[], rest: Partial<Card> = {}): Card => ({
  title,
  text: title,
  icon: 'pencil',
  kind: 'agent',
  covers: [{ workflow: 'build', steps }],
  ...rest,
});

/** Build's story in two phases, the second repeated by its `rounds` loop. */
const drilldown = (patch: Partial<Drilldown> = {}): Drilldown => ({
  phases: [
    { label: 'Build', cards: [card('Write the change', ['build__build'])] },
    { label: 'Check', cards: [card('Code review', ['rounds.review'], { kind: 'check' })] },
  ],
  loop: { label: 'Up to 3 rounds', from: 2, to: 2, workflow: 'build', step: 'rounds' },
  ...patch,
});

/** `minimal()` with build's stage given `drilldown`. */
const withDrilldown = (steps: Drilldown) => ({
  stages: minimal().stages.map(stage =>
    stage.id === 'build' ? { ...stage, drilldown: steps } : stage
  ),
});

type Columns = NonNullable<FactoryView['columns']>;
const work = (stages: string[], id = 'work'): Columns[number] => ({
  id,
  label: 'Plan & build',
  blurb: 'Plan, build',
  stages,
});
const merged = (stages = ['landed']): Columns[number] => ({
  id: 'merged',
  label: 'Merged',
  blurb: 'Merged changes',
  stages,
});

type Shadow = NonNullable<FactoryView['shadows']>[number];
const verdict = (workflow: string, node: string): Extract<Shadow, { reads: 'verdict' }> => ({
  workflow,
  node,
  label: 'Would it start on its own',
  reads: 'verdict',
  pointer: '/admit',
  why: '/why',
  words: { auto: 'would start on its own', ask: 'would ask you first' },
});
const drain = {
  workflow: 'discoveries',
  shadow: true,
  filed: '/filed',
  held: '/held',
  dropped: '/dropped',
  entry: { title: '/title' },
};
const discoveries = { ...drain, shadow: false, entry: { title: '/title', kind: '/kind' } };
const loop = { workflow: 'build', loop: 'rounds' };
const stageRounds = { workflow: 'plan', round: '/round', allowance: '/allowance' };
const change = { workflow: 'build', pointer: '/change' };
const point = { workflow: 'build', node: 'rounds.verdict', outcome: 'approve' };

/** A declaration: `minimal()` with these top-level fields replaced. */
const viewWith = (patch: Record<string, unknown>) => ({ ...minimal(), ...patch });

/**
 * Where a rejected declaration fails, as dotted issue paths. The path is what a pack author
 * acts on; the message wording is asserted once, below.
 */
function issuePaths(view: unknown): string[] {
  const parsed = factoryViewSchema.safeParse(view);
  if (parsed.success) throw new Error('expected the declaration to be rejected');
  return parsed.error.issues.map(issue => issue.path.join('.'));
}

test("accepts this repository's shipped declaration", async () => {
  const parsed = factoryViewSchema.safeParse(JSON.parse(await readFile(SHIPPED, 'utf8')));
  expect(parsed.error?.issues ?? []).toEqual([]);
  expect(parsed.data?.pack).toBe('Wirasm/archon-software-factory');
});

describe('a declaration the schema accepts', () => {
  test('every optional field at once, each naming workflows a stage lists', () => {
    const rich = viewWith({
      stages: minimal().stages.map(stage =>
        stage.id === 'build' ? { ...stage, short: 'x'.repeat(24), drilldown: drilldown() } : stage
      ),
      // workflow:* beside exact outcomes; a parked and an awaits outcome placed.
      placement: {
        'plan:planned': 'build',
        'build:*': 'landed',
        'plan:park': 'plan',
        'plan:shape': 'plan',
      },
      parked: { 'plan:park': { label: 'Parked', why: '/why' } },
      awaits: {
        'plan:shape': { label: 'Needs shaping', why: '/why', questions: '/open_questions' },
      },
      map: {
        // Old-grid col and row still load; arrows join any two stages, back and as a person's step.
        cards: [{ stage: 'plan', col: 1, row: 1 }, { stage: 'build' }],
        arrows: [
          { from: 'build', to: 'plan', label: 'replan', back: true, person: true },
          { from: 'plan', to: 'plan', label: 'asks answered' },
        ],
        notes: [],
      },
      returns: [{ ...point, outcome: 'return' }],
      approves: [point],
      change: [change, { workflow: 'plan', pointer: '/pr' }],
      rounds: [loop, stageRounds],
      // Discoveries may name a workflow no stage lists.
      discoveries: drain,
      shadows: [
        verdict('plan', 'admit'),
        {
          workflow: 'build',
          node: 'rounds.checks',
          label: 'Checks',
          reads: 'checks',
          results: '/results',
          entry: { name: '/name', passed: '/passed', seconds: '/seconds' },
        },
        {
          workflow: 'discoveries',
          node: 'result',
          label: 'Files',
          reads: 'lists',
          lists: [{ pointer: '/filed', words: 'would file' }],
        },
      ],
      steps: { build: { build__build: 'Writes the change' } },
      verdicts: { build: { 'rounds.review': { approve: 'approved', ask: 'asked' } } },
      asked: ['build:ask', 'plan:*'],
      answers: { 'build:drop': { starts: 'Closes the PR without merging' } },
      story: {
        outcomes: {
          'plan:planned': 'Planned',
          'build:*': { withChange: 'Built its PR', withoutChange: 'Built' },
        },
        steps: { build: { build__build: 'Wrote it' } },
        said: ['/summary', '/why'],
      },
      retired: ['build'],
      columns: [work(['plan', 'build']), merged()],
    });
    const parsed = factoryViewSchema.safeParse(rich);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.data?.columns?.map(column => column.id)).toEqual(['work', 'merged']);
  });

  test.each<[string, Record<string, unknown>]>([
    ['the minimal one', {}],
    ['one change source, loop-form rounds', { change, rounds: loop }],
    ['stage-form rounds alone', { rounds: stageRounds }],
    ['discoveries that are no shadow', { discoveries }],
    [
      'a parked outcome placed by workflow:*',
      {
        placement: { 'plan:*': 'plan' },
        endings: {},
        parked: { 'plan:park': { label: 'Parked' } },
      },
    ],
  ])('%s', (_name, patch) => {
    expect(factoryViewSchema.safeParse(viewWith(patch)).error?.issues ?? []).toEqual([]);
  });
});

describe('a declaration the schema rejects, at the path a pack author fixes', () => {
  const first = card('Write the change', ['build__build']);
  const review = card('Code review', ['rounds.review'], { kind: 'check' });
  /** Build's drill-down with phase `phase`'s cards replaced. */
  const recarded = (phase: number, cards: Card[]) =>
    withDrilldown(
      drilldown({ phases: drilldown().phases.map((p, i) => (i === phase ? { ...p, cards } : p)) })
    );
  const shape = { 'plan:shape': { label: 'Needs shaping' } };
  const park = { 'plan:park': { label: 'Parked' } };
  const stages = minimal().stages;
  // Each row: the issue paths, then the fields that replace minimal()'s.
  test.each<[string[], Record<string, unknown>]>([
    [['placement.plan:planned'], { placement: { 'plan:planned': 'biuld' } }],
    ...['build:', ':built', 'build'].map(
      key =>
        [[`placement.${key}`], { placement: { [key]: 'landed' } }] as [
          string[],
          Record<string, unknown>,
        ]
    ),
    [
      ['stages.0.short'],
      { stages: [{ ...stages[0]!, short: 'x'.repeat(25) }, ...stages.slice(1)] },
    ],
    [['stages.3.id'], { stages: [...stages, { ...stages[0]!, label: 'Again' }] }],
    // A drill-down card covers only its stage's workflows, with a known kind, icon and a step.
    [
      ['stages.1.drilldown.phases.1.cards.0.covers.1.workflow'],
      recarded(1, [{ ...review, covers: [...review.covers, { workflow: 'plan', steps: ['p'] }] }]),
    ],
    [
      [
        'stages.1.drilldown.phases.0.cards.0.kind',
        'stages.1.drilldown.phases.0.cards.1.covers.0.steps',
      ],
      recarded(0, [
        { ...first, kind: 'robot' as 'agent' },
        { ...first, covers: [{ workflow: 'build', steps: [] }] },
      ]),
    ],
    [
      ['stages.1.drilldown.phases.0.cards.0.icon'],
      recarded(0, [{ ...first, icon: 'x' as 'pencil' }]),
    ],
    // A loop beyond the phases, over another workflow.
    [
      ['stages.1.drilldown.loop.workflow', 'stages.1.drilldown.loop'],
      withDrilldown(
        drilldown({ loop: { label: 'R', from: 2, to: 3, workflow: 'plan', step: 'rounds' } })
      ),
    ],
    // Every field that names a workflow takes only one a stage lists.
    [['returns.0.workflow'], { returns: [{ ...point, workflow: 'deliver' }] }],
    [['approves.0.workflow'], { approves: [{ ...point, workflow: 'deliver' }] }],
    [['change.workflow'], { change: { workflow: 'deliver', pointer: '/c' } }],
    [['change.1.workflow'], { change: [change, { workflow: 'deliver', pointer: '/c' }] }],
    [['rounds.workflow'], { rounds: { ...stageRounds, workflow: 'deliver' } }],
    [['partOf.workflow'], { partOf: { workflow: 'order', pointer: '/p', outcome: 'ready' } }],
    [['steps.deliver'], { steps: { deliver: { build__build: 'x' } } }],
    [
      ['verdicts.deliver', 'asked.0'],
      { verdicts: { deliver: { r: { return: 'returned' } } }, asked: ['deliver:ask'] },
    ],
    [['answers.deliver:drop'], { answers: { 'deliver:drop': { starts: 'Closes it' } } }],
    [
      ['story.outcomes.deliver:ready', 'story.steps.deliver'],
      { story: { outcomes: { 'deliver:ready': 'R' }, steps: { deliver: { a: 'A' } } } },
    ],
    [['retired.0'], { retired: ['deliver'] }],
    [['shadows.0.workflow'], { shadows: [verdict('triage', 'admit')] }],
    [
      ['placement.deliver:park', 'parked.deliver:park'],
      {
        placement: { 'plan:planned': 'build', 'deliver:park': 'plan' },
        parked: { 'deliver:park': { label: 'P' } },
      },
    ],
    // Lists name each workflow once.
    [['change.1.workflow'], { change: [change, change] }],
    [['change'], { change: [] }],
    [['rounds.1.workflow'], { rounds: [loop, { ...stageRounds, workflow: 'build' }] }],
    [['retired.1'], { retired: ['build', 'build'] }],
    [['shadows.1.node'], { shadows: [verdict('plan', 'admit'), verdict('plan', 'admit')] }],
    [['discoveries.entry.title'], { discoveries: { ...discoveries, entry: { title: 'title' } } }],
    [['discoveries'], { discoveries: { ...discoveries, folded: '/folded' } }],
    // A sentence a person reads is plain text of at most 160 characters; said is a pointer.
    [['answers.build:drop.starts'], { answers: { 'build:drop': { starts: 'x'.repeat(161) } } }],
    [['story.outcomes.plan:*'], { story: { outcomes: { 'plan:*': ' ' } } }],
    [['story.outcomes.plan:*'], { story: { outcomes: { 'plan:*': { withChange: 'Planned' } } } }],
    [['story.said.0'], { story: { outcomes: { 'plan:*': 'Planned' }, said: ['summary'] } }],
    // A parked or awaits outcome is placed, not ended, and not both.
    [['parked.plan:park'], { parked: park }],
    [
      ['endings.plan:park'],
      { placement: { 'plan:park': 'plan' }, endings: { 'plan:park': 'S' }, parked: park },
    ],
    [['awaits.plan:shape'], { awaits: shape }],
    [
      ['endings.plan:shape'],
      { placement: { 'plan:shape': 'plan' }, endings: { 'plan:shape': 'S' }, awaits: shape },
    ],
    [
      ['awaits.plan:shape'],
      {
        placement: { 'plan:shape': 'plan' },
        parked: { 'plan:shape': { label: 'P' } },
        awaits: shape,
      },
    ],
    [
      ['awaits.plan:shape.questions'],
      {
        placement: { 'plan:shape': 'plan' },
        awaits: { 'plan:shape': { label: 'N', questions: 'q' } },
      },
    ],
    // Verdict meanings are a closed set and never restate a declared return.
    [
      ['verdicts.build.rounds.tests.sound'],
      { verdicts: { build: { 'rounds.tests': { sound: 'passed' } } } },
    ],
    [
      ['verdicts.build.rounds.verdict.return'],
      {
        returns: [{ ...point, outcome: 'return' }],
        verdicts: { build: { 'rounds.verdict': { return: 'returned' } } },
      },
    ],
    [
      ['map.cards.1.stage', 'map.notes.0.near'],
      {
        map: {
          ...minimal().map,
          cards: [{ stage: 'plan' }, { stage: 'nowhere' }],
          notes: [{ text: 'H', near: 'nowhere' }],
        },
      },
    ],
    // Columns hold every stage once, and the landed stage alone.
    [['columns'], { columns: [work(['plan']), merged()] }],
    [
      ['columns.1.stages.0'],
      { columns: [work(['plan', 'build']), work(['build'], 'again'), merged()] },
    ],
    [['columns.0.stages.2'], { columns: [work(['plan', 'build', 'biuld']), merged()] }],
    [['columns.1.id'], { columns: [work(['plan']), work(['build']), merged()] }],
    [['columns.1.stages'], { columns: [work(['plan']), merged(['build', 'landed'])] }],
    // A shadow reads a known way, a verdict with words; the discoveries flag agrees with them.
    [['shadows.0.words'], { shadows: [{ ...verdict('plan', 'admit'), words: {} }] }],
    [['shadows.0.reads'], { shadows: [{ ...verdict('plan', 'admit'), reads: 'guess' }] }],
    [['discoveries.shadow'], { discoveries: drain }],
    [['discoveries.shadow'], { discoveries, shadows: [verdict('discoveries', 'result')] }],
  ])('at %p', (paths, patch) => {
    expect(issuePaths(viewWith(patch))).toEqual(paths);
  });

  test.each<[string, Record<string, unknown>]>([
    ['an answer key by workflow:*', { answers: { 'build:*': { starts: 'Closes it' } } }],
    ['an answer key with no workflow', { answers: { drop: { starts: 'Closes it' } } }],
    ['stage-form rounds with no round pointer', { rounds: { workflow: 'plan', allowance: '/a' } }],
    ['the same in a list', { rounds: [{ workflow: 'plan', allowance: '/a' }] }],
    ['stage-form rounds with a loop too', { rounds: { ...stageRounds, loop: 'rounds' } }],
    ['a round that is no pointer', { rounds: { ...stageRounds, round: 'round' } }],
    ['an unknown field', { colour: 'red' }],
  ])('%s', (_name, patch) => {
    expect(factoryViewSchema.safeParse(viewWith(patch)).success).toBe(false);
  });

  test('a bad rounds or change source says which entry and which key to fix', () => {
    const said = (patch: Record<string, unknown>): string[] =>
      (factoryViewSchema.safeParse(viewWith(patch)).error?.issues ?? []).map(
        issue => `${issue.path.join('.')}: ${issue.message}`
      );
    const stage = 'a stage-form rounds source { workflow, round, allowance }';
    const noRound = { workflow: 'plan', allowance: '/allowance' };
    expect(said({ rounds: noRound })).toEqual([`rounds: ${stage} needs \`round\``]);
    expect(said({ rounds: [loop, noRound] })).toEqual([
      `rounds: entry 1: ${stage} needs \`round\``,
    ]);
    // A misspelt key is named, not only the key it was meant to be.
    expect(said({ rounds: [loop, { ...noRound, rond: '/round' }] })).toEqual([
      `rounds: entry 1: ${stage} does not take \`rond\``,
    ]);
    expect(said({ rounds: { ...loop, round: '/round' } })).toEqual([
      'rounds: a loop-form rounds source { workflow, loop } does not take `round`',
    ]);
    expect(said({ rounds: 'build' })).toEqual([
      'rounds: expected a rounds source: { workflow, loop } or { workflow, round, allowance }',
    ]);
    expect(said({ change: [change, { workflow: 'plan' }] })).toEqual([
      'change: entry 1: a change source { workflow, pointer } needs `pointer`',
    ]);
    expect(said({ change: { workflow: 'build' } })).toEqual([
      'change: a change source { workflow, pointer } needs `pointer`',
    ]);
  });
});

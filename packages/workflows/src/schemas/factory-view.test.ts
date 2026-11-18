import { describe, expect, test } from 'bun:test';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { factoryViewSchema, type FactoryView } from './factory-view';

/** The declaration this repository ships for its own factory, as a project file. */
const SHIPPED = join(
  import.meta.dir,
  '..',
  '..',
  '..',
  '..',
  '.archon',
  'packs',
  'Wirasm.archon-software-factory.factory-view.json'
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

/** Build's story in two phases, the second repeated by its `rounds` loop. */
const drilldown = (): Drilldown => ({
  phases: [
    {
      label: 'Build',
      cards: [
        {
          title: 'Write the change',
          text: 'Writes the change and opens a draft pull request',
          icon: 'pencil',
          kind: 'agent',
          covers: [{ workflow: 'build', steps: ['build__build'] }],
        },
      ],
    },
    {
      label: 'Check',
      cards: [
        {
          title: 'Code review',
          text: 'Reads the change',
          icon: 'search-code',
          kind: 'check',
          covers: [{ workflow: 'build', steps: ['rounds.review'] }],
        },
      ],
    },
  ],
  loop: { label: 'Up to 3 rounds', from: 2, to: 2, workflow: 'build', step: 'rounds' },
});

/**
 * Where a rejected declaration fails, as dotted issue paths. The path is what a pack author
 * acts on; the message wording is not asserted.
 */
function issuePaths(view: unknown): string[] {
  const parsed = factoryViewSchema.safeParse(view);
  if (parsed.success) throw new Error('expected the declaration to be rejected');
  return parsed.error.issues.map(issue => issue.path.join('.'));
}

describe('factoryViewSchema', () => {
  test("accepts this repository's shipped declaration", async () => {
    const parsed = factoryViewSchema.safeParse(JSON.parse(await readFile(SHIPPED, 'utf8')));
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.data?.pack).toBe('Wirasm/archon-software-factory');
  });

  test('accepts a minimal declaration', () => {
    expect(factoryViewSchema.safeParse(minimal()).success).toBe(true);
  });

  test('a placement naming an undeclared stage is rejected at its key', () => {
    const view = minimal();
    view.placement['plan:planned'] = 'biuld';
    expect(issuePaths(view)).toEqual(['placement.plan:planned']);
  });

  test('placement takes workflow:* beside exact outcomes; a key without both halves is rejected', () => {
    const view = minimal();
    view.placement['build:*'] = 'landed';
    expect(factoryViewSchema.safeParse(view).success).toBe(true);
    for (const key of ['build:', ':built', 'build']) {
      const broken = minimal();
      broken.placement[key] = 'landed';
      expect(issuePaths(broken)).toEqual([`placement.${key}`]);
    }
  });

  test("a declared arrow may join any two stages, and may be marked as a person's step", () => {
    const view = minimal();
    view.map.arrows = [
      { from: 'plan', to: 'build', label: 'planned' },
      { from: 'build', to: 'plan', label: 'replan', back: true, person: true },
      { from: 'plan', to: 'plan', label: 'asks answered' },
    ];
    expect(factoryViewSchema.safeParse(view).error?.issues ?? []).toEqual([]);
  });

  test('a stage takes a drill-down of phases, cards and a loop over its own workflow', () => {
    const view = minimal();
    view.stages[1] = { ...view.stages[1]!, drilldown: drilldown() };
    const parsed = factoryViewSchema.safeParse(view);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.data?.stages[1]?.drilldown?.phases.map(phase => phase.label)).toEqual([
      'Build',
      'Check',
    ]);
  });

  test("a drill-down card covering a workflow its stage does not list is rejected at the cover's path", () => {
    const view = minimal();
    const steps = drilldown();
    steps.phases[1]!.cards[0]!.covers.push({ workflow: 'plan', steps: ['plan'] });
    view.stages[1] = { ...view.stages[1]!, drilldown: steps };
    expect(issuePaths(view)).toEqual(['stages.1.drilldown.phases.1.cards.0.covers.1.workflow']);
  });

  test('a loop beyond the phases, or naming another workflow, is rejected', () => {
    const view = minimal();
    const steps = drilldown();
    steps.loop = { label: 'Rounds', from: 2, to: 3, workflow: 'plan', step: 'rounds' };
    view.stages[1] = { ...view.stages[1]!, drilldown: steps };
    expect(issuePaths(view)).toEqual([
      'stages.1.drilldown.loop.workflow',
      'stages.1.drilldown.loop',
    ]);
  });

  test('a drill-down card needs a kind it knows and at least one step', () => {
    const view = minimal();
    const steps = drilldown();
    const first = steps.phases[0]!.cards[0]!;
    steps.phases[0]!.cards = [
      { ...first, kind: 'robot' as 'agent' },
      { ...first, covers: [{ workflow: 'build', steps: [] }] },
    ];
    view.stages[1] = { ...view.stages[1]!, drilldown: steps };
    expect(issuePaths(view)).toEqual([
      'stages.1.drilldown.phases.0.cards.0.kind',
      'stages.1.drilldown.phases.0.cards.1.covers.0.steps',
    ]);
  });

  test('a drill-down card names an icon from the closed set', () => {
    const view = minimal();
    const steps = drilldown();
    const first = steps.phases[0]!.cards[0]!;
    steps.phases[0]!.cards = [{ ...first, icon: 'not-an-icon' as 'pencil' }, first];
    view.stages[1] = { ...view.stages[1]!, drilldown: steps };
    expect(issuePaths(view)).toEqual(['stages.1.drilldown.phases.0.cards.0.icon']);
  });

  test('a stage declared twice is rejected', () => {
    const view = minimal();
    view.stages.push({ ...view.stages[0]!, label: 'Again' });
    expect(issuePaths(view)).toEqual(['stages.3.id']);
  });

  test('a returns entry naming a workflow no stage lists is rejected', () => {
    const view = {
      ...minimal(),
      returns: [{ workflow: 'deliver', node: 'verdict', outcome: 'x' }],
    };
    expect(issuePaths(view)).toEqual(['returns.0.workflow']);
  });

  test('an approves entry is accepted beside returns, and one naming a workflow no stage lists is rejected', () => {
    const point = { workflow: 'build', node: 'rounds.verdict', outcome: 'approve' };
    expect(
      factoryViewSchema.safeParse({
        ...minimal(),
        returns: [{ ...point, outcome: 'return' }],
        approves: [point],
      }).success
    ).toBe(true);
    expect(issuePaths({ ...minimal(), approves: [{ ...point, workflow: 'deliver' }] })).toEqual([
      'approves.0.workflow',
    ]);
  });

  test('a partOf naming a workflow no stage lists is rejected', () => {
    expect(
      issuePaths({
        ...minimal(),
        partOf: { workflow: 'order', pointer: '/part_of', outcome: 'ready' },
      })
    ).toEqual(['partOf.workflow']);
  });

  test('step names are accepted for a listed workflow and rejected for one no stage lists', () => {
    const steps = { build: { build__build: 'Writes the change' } };
    expect(factoryViewSchema.safeParse({ ...minimal(), steps }).success).toBe(true);
    expect(issuePaths({ ...minimal(), steps: { deliver: { build__build: 'x' } } })).toEqual([
      'steps.deliver',
    ]);
  });

  test('verdicts and asked are accepted for a listed workflow and rejected for one no stage lists', () => {
    const verdicts = { build: { 'rounds.review': { approve: 'approved', ask: 'asked' } } };
    expect(
      factoryViewSchema.safeParse({ ...minimal(), verdicts, asked: ['build:ask', 'plan:*'] })
        .success
    ).toBe(true);
    expect(
      issuePaths({
        ...minimal(),
        verdicts: { deliver: { review: { return: 'returned' } } },
        asked: ['deliver:ask'],
      })
    ).toEqual(['verdicts.deliver', 'asked.0']);
  });

  test('a verdict meaning outside the closed set is rejected', () => {
    const verdicts = { build: { 'rounds.tests': { sound: 'passed' } } };
    expect(issuePaths({ ...minimal(), verdicts })).toEqual(['verdicts.build.rounds.tests.sound']);
  });

  test('a verdicts entry restating a declared return or approval is rejected at its path', () => {
    const view = {
      ...minimal(),
      returns: [{ workflow: 'build', node: 'rounds.verdict', outcome: 'return' }],
      verdicts: { build: { 'rounds.verdict': { return: 'returned', ask: 'asked' } } },
    };
    expect(issuePaths(view)).toEqual(['verdicts.build.rounds.verdict.return']);
  });

  test('a card for an undeclared stage, and a note near nothing, are rejected', () => {
    const view = minimal();
    view.map.cards[1] = { stage: 'nowhere' };
    view.map.notes = [{ text: 'Here', near: 'nowhere' }];
    expect(issuePaths(view)).toEqual(['map.cards.1.stage', 'map.notes.0.near']);
  });

  test('a card written for the old grid still loads; its col and row are ignored', () => {
    const view = minimal();
    view.map.cards = [
      { stage: 'plan', col: 1, row: 1 },
      { stage: 'build', col: 1, row: 1 },
    ];
    expect(factoryViewSchema.safeParse(view).success).toBe(true);
  });

  test('an unknown field is rejected', () => {
    const parsed = factoryViewSchema.safeParse({ ...minimal(), colour: 'red' });
    expect(parsed.success).toBe(false);
  });
});

describe('factoryViewSchema columns', () => {
  type Columns = NonNullable<FactoryView['columns']>;
  const grouped = (columns: Columns): FactoryView => ({ ...minimal(), columns });
  const work = (stages: string[]): Columns[number] => ({
    id: 'work',
    label: 'Plan & build',
    blurb: 'Plan, build',
    stages,
  });
  const merged: Columns[number] = {
    id: 'merged',
    label: 'Merged',
    blurb: 'Merged changes',
    stages: ['landed'],
  };
  /** Each issue as its dotted path and its message: both are what a pack author acts on. */
  function issues(view: unknown): [string, string][] {
    const parsed = factoryViewSchema.safeParse(view);
    if (parsed.success) throw new Error('expected the declaration to be rejected');
    return parsed.error.issues.map(issue => [issue.path.join('.'), issue.message]);
  }

  test('groups stages into columns, and keeps them in their declared order', () => {
    const parsed = factoryViewSchema.safeParse(grouped([work(['plan', 'build']), merged]));
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(parsed.data?.columns?.map(column => column.id)).toEqual(['work', 'merged']);
  });

  test('a declaration without columns still loads', () => {
    expect(factoryViewSchema.safeParse(minimal()).data?.columns).toBeUndefined();
  });

  test('a stage in no column is a finding', () => {
    expect(issues(grouped([work(['plan']), merged]))).toEqual([
      ['columns', 'stage "build" is in no column'],
    ]);
  });

  test('a stage in two columns is a finding at its second place', () => {
    const view = grouped([work(['plan', 'build']), { ...work(['build']), id: 'again' }, merged]);
    expect(issues(view)).toEqual([
      ['columns.1.stages.0', 'stage "build" is in column "work" already'],
    ]);
  });

  test('a column naming a stage no stage declares is a finding at its place', () => {
    expect(issues(grouped([work(['plan', 'build', 'biuld']), merged]))).toEqual([
      ['columns.0.stages.2', 'names stage "biuld", which is not declared in stages'],
    ]);
  });

  test('a column id declared twice is a finding', () => {
    expect(issues(grouped([work(['plan']), work(['build']), merged]))).toEqual([
      ['columns.1.id', 'column "work" is declared twice'],
    ]);
  });

  test('the landed stage sharing its column is a finding', () => {
    expect(issues(grouped([work(['plan']), { ...merged, stages: ['build', 'landed'] }]))).toEqual([
      ['columns.1.stages', 'the landed stage "landed" takes a column of its own'],
    ]);
  });
});

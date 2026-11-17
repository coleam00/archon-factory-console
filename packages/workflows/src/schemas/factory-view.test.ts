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
    cards: [
      { stage: 'plan', col: 1, row: 1 },
      { stage: 'build', col: 2, row: 1 },
    ],
    arrows: [{ from: 'build', to: 'landed', label: 'merged' }],
    notes: [{ text: 'You answer asks here', near: 'needs-you' }],
  },
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

  test('a declared arrow joins stages of one workflow or runs into landed; the graph draws the rest', () => {
    const view = minimal();
    view.stages.push({
      id: 'review',
      label: 'Review',
      blurb: 'Reviews.',
      group: 'check',
      workflows: ['build'],
    });
    view.map.arrows = [
      { from: 'build', to: 'review' },
      { from: 'review', to: 'landed' },
      { from: 'plan', to: 'build', label: 'planned' },
    ];
    const parsed = factoryViewSchema.safeParse(view);
    expect(parsed.error?.issues.map(issue => [issue.path.join('.'), issue.message])).toEqual([
      [
        'map.arrows.2',
        'joins "plan" (plan) and "build" (build), which share no workflow: the pack graph draws a hand-off between workflows',
      ],
    ]);
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

  test('step names are accepted for a listed workflow and rejected for one no stage lists', () => {
    const steps = { build: { build__build: 'Writes the change' } };
    expect(factoryViewSchema.safeParse({ ...minimal(), steps }).success).toBe(true);
    expect(issuePaths({ ...minimal(), steps: { deliver: { build__build: 'x' } } })).toEqual([
      'steps.deliver',
    ]);
  });

  test('two cards in one cell, and a note near nothing, are rejected', () => {
    const view = minimal();
    view.map.cards[1] = { stage: 'build', col: 1, row: 1 };
    view.map.notes = [{ text: 'Here', near: 'nowhere' }];
    expect(issuePaths(view)).toEqual(['map.cards.1', 'map.notes.0.near']);
  });

  test('an unknown field is rejected', () => {
    const parsed = factoryViewSchema.safeParse({ ...minimal(), colour: 'red' });
    expect(parsed.success).toBe(false);
  });
});

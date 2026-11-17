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
    arrows: [{ from: 'plan', to: 'build', label: 'planned' }],
    notes: [{ text: 'You answer asks here', near: 'needs-you' }],
  },
});

/** The issues of a rejected declaration, as `path: message` lines. */
function issues(view: unknown): string[] {
  const parsed = factoryViewSchema.safeParse(view);
  if (parsed.success) throw new Error('expected the declaration to be rejected');
  return parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
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
    expect(issues(view)).toEqual([
      'placement.plan:planned: names stage "biuld", which is not declared in stages',
    ]);
  });

  test('a stage declared twice is rejected', () => {
    const view = minimal();
    view.stages.push({ ...view.stages[0]!, label: 'Again' });
    expect(issues(view)).toEqual(['stages.3.id: stage "plan" is declared twice']);
  });

  test('a returns entry naming a workflow no stage lists is rejected', () => {
    const view = {
      ...minimal(),
      returns: [{ workflow: 'deliver', node: 'verdict', outcome: 'x' }],
    };
    expect(issues(view)).toEqual([
      'returns.0.workflow: names workflow "deliver", which no stage lists',
    ]);
  });

  test('two cards in one cell, and a note near nothing, are rejected', () => {
    const view = minimal();
    view.map.cards[1] = { stage: 'build', col: 1, row: 1 };
    view.map.notes = [{ text: 'Here', near: 'nowhere' }];
    expect(issues(view)).toEqual([
      'map.cards.1: cell 1,1 holds another card',
      'map.notes.0.near: names stage "nowhere", which is not declared in stages',
    ]);
  });

  test('an unknown field is rejected', () => {
    expect(issues({ ...minimal(), colour: 'red' })).toEqual([': Unrecognized key: "colour"']);
  });
});

import { expect, test } from 'bun:test';
import type { FactoryDeclaration } from './board';
import { boardColumns, groupTone } from './board-columns';
import { VIEW } from './board.test-fixtures';

test("the shipped view's columns, in order, each in its stage group's colour or merged", () => {
  expect(boardColumns(VIEW).map(column => [column.id, column.stages, column.tone])).toEqual([
    ['intake', ['order', 'triage', 'link'], 'intake'],
    ['plan-build', ['plan', 'build'], 'build'],
    ['checks-review', ['checks', 'host'], 'check'],
    ['ready', ['ready'], 'land'],
    ['merged', ['landed'], 'merged'],
  ]);
});

test('a view without columns has one column per stage, with its label and blurb', () => {
  const { columns: _, ...older } = VIEW;
  const columns = boardColumns(older as FactoryDeclaration);
  expect(columns.map(column => [column.id, column.label, column.tone])).toEqual(
    VIEW.stages.map(stage => [stage.id, stage.label, expect.any(String)])
  );
  expect(columns.at(-1)).toMatchObject({
    label: 'Merged',
    blurb: 'The change is merged.',
    tone: 'merged',
  });
});

test('a stage group the console has no colour for reads as other', () => {
  expect(groupTone('ops')).toBe('other');
  expect(groupTone('check')).toBe('check');
});

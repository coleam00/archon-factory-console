import { describe, expect, test } from 'bun:test';
import { shippedView } from '../curated.test-fixtures';
import { itemOn } from '../items.test-fixtures';
import { itemStateLine } from './item-state';

const ended = (workflow: string, outcome: string) => {
  const read = itemOn('x', workflow, 'done');
  const [run] = read.runs;
  return { ...read, runs: run === undefined ? [] : [{ ...run, outcome }] };
};

describe("an item's state line", () => {
  test('a merged item reads Merged, never the workflow it last ran', () => {
    const line = itemStateLine(shippedView, {
      ...itemOn('m', 'landed', 'done'),
      merged: { at: '2026-11-24T10:00:00Z' },
    } as unknown as ReturnType<typeof itemOn>);
    expect(line.tone).toBe('merged');
    expect(line.text).toContain('Merged');
    expect(line.text).not.toContain('landed');
  });

  test("a running item names its stage by the view file's label, not its workflow id", () => {
    const line = itemStateLine(shippedView, itemOn('b', 'stage-build', 'running'));
    expect(line.tone).toBe('running');
    expect(line.text).toContain('Build');
    expect(line.text).not.toContain('stage-build');
  });

  test('an item waiting on an ask reads as needing you', () => {
    expect(itemStateLine(shippedView, itemOn('a', 'landgate', 'waiting', true)).tone).toBe(
      'needs-you'
    );
  });

  test("an item at rest reads its outcome in the file's words", () => {
    const line = itemStateLine(shippedView, ended('triage', 'park'));
    expect(line.text).toContain(shippedView.outcomeLabels['triage:park'] ?? 'missing');
    expect(line.text).not.toContain('park ');
  });
});

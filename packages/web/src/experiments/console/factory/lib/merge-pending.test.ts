import { describe, expect, test } from 'bun:test';
import { delivering, progressOf, readyWithMerge, realItem } from './board.test-fixtures';
import { mergePending, stageCountPending } from './merge-pending';

describe('mergePending', () => {
  test('an idle item whose merge state the server is still asking waits', () => {
    expect(mergePending(readyWithMerge('p', 'pending'))).toBe(true);
  });

  test('a running item is placed by its run, so it does not wait', () => {
    const item = delivering('build');
    const progress = progressOf(item);
    item.progress = {
      ...progress,
      change: { url: 'https://example.test/pull/1', merged: 'pending', mergedAt: null, number: 1 },
    };
    expect(mergePending(item)).toBe(false);
  });

  test('a settled answer, unread progress or no change is final, not waiting', () => {
    for (const merged of [true, false, 'unknown'] as const)
      expect(mergePending(readyWithMerge('s', merged))).toBe(false);
    expect(mergePending({ ...realItem('6'), progress: null })).toBe(false);
    const noChange = realItem('6');
    noChange.progress = { ...progressOf(noChange), change: null };
    expect(mergePending(noChange)).toBe(false);
  });
});

describe('stageCountPending', () => {
  const pending = readyWithMerge('p', 'pending');
  test('a stage holding a waiting item, and the landed stage while any item waits', () => {
    expect(stageCountPending('ready', 'landed', [pending], true)).toBe(true);
    expect(stageCountPending('landed', 'landed', [], true)).toBe(true);
    expect(stageCountPending('build', 'landed', [realItem('6')], true)).toBe(false);
    expect(stageCountPending('landed', 'landed', [], false)).toBe(false);
  });
});

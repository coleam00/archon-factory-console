import { describe, expect, test } from 'bun:test';
import { askItem, gateItem, usageLimitItem } from '../needs-you.test-fixtures';
import { NEEDS_YOU_SHOWN, needsYou, visibleNeedsYou } from './needs-you';

describe('needsYou', () => {
  test('orders newest first, untimed waits last in server order, and drops usage limits', () => {
    const older = askItem({ ref: 'ask:old', pausedAt: '2026-11-15T09:00:00.000Z' });
    const newer = askItem({ ref: 'ask:new', pausedAt: '2026-11-16T09:00:00.000Z' });
    const gateA = gateItem({ ref: 'gate:a' });
    const gateB = gateItem({ ref: 'gate:b' });
    const limit = usageLimitItem({ ref: 'limit:1', pausedAt: '2026-11-16T10:00:00.000Z' });
    const items = [gateA, older, limit, gateB, newer];

    const list = needsYou(items);

    expect(list.map(item => item.ref)).toEqual(['ask:new', 'ask:old', 'gate:a', 'gate:b']);
    // The input is left as the server sent it.
    expect(items.map(item => item.ref)).toEqual([
      'gate:a',
      'ask:old',
      'limit:1',
      'gate:b',
      'ask:new',
    ]);
  });

  test('a queue holding only a usage limit needs no one', () => {
    expect(needsYou([usageLimitItem({ ref: 'limit:1' })])).toEqual([]);
  });
});

describe('visibleNeedsYou', () => {
  const asks = (count: number): ReturnType<typeof askItem>[] =>
    Array.from({ length: count }, (_, i) => askItem({ ref: `ask:${(i + 1).toString()}` }));
  const closed = { showAll: false, opened: new Set<string>() };
  const refs = (items: { ref: string }[]): string[] => items.map(item => item.ref);

  test('shows every row up to the cap, hiding none', () => {
    expect(NEEDS_YOU_SHOWN).toBe(4);
    for (const count of [0, 1, 2, 4]) {
      const { shown, hidden } = visibleNeedsYou(asks(count), closed);
      expect(shown).toHaveLength(count);
      expect(hidden).toBe(0);
    }
  });

  test('past the cap shows the first four in order and counts the rest', () => {
    expect(visibleNeedsYou(asks(5), closed)).toEqual({ shown: asks(4), hidden: 1 });
    const nine = visibleNeedsYou(asks(9), closed);
    expect(refs(nine.shown)).toEqual(['ask:1', 'ask:2', 'ask:3', 'ask:4']);
    expect(nine.hidden).toBe(5);
  });

  test('show all shows every row', () => {
    expect(visibleNeedsYou(asks(9), { ...closed, showAll: true })).toEqual({
      shown: asks(9),
      hidden: 0,
    });
  });

  test('a row the operator opened past the cap stays shown, in its place', () => {
    const { shown, hidden } = visibleNeedsYou(asks(6), {
      showAll: false,
      opened: new Set(['ask:6']),
    });
    expect(refs(shown)).toEqual(['ask:1', 'ask:2', 'ask:3', 'ask:4', 'ask:6']);
    expect(hidden).toBe(1);
  });

  test('an opened ref that has left the queue changes nothing', () => {
    expect(visibleNeedsYou(asks(6), { showAll: false, opened: new Set(['ask:gone']) })).toEqual({
      shown: asks(4),
      hidden: 2,
    });
  });
});

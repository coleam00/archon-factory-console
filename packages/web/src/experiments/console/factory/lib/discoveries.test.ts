import { describe, expect, test } from 'bun:test';
import { foundChips, kindLabel, openFindings } from './discoveries';
import { DISCOVERIES } from './discoveries.test-fixtures';

describe('the words of what the factory found', () => {
  test('open findings are those no item carries', () => {
    expect(openFindings(DISCOVERIES).map(f => f.from.key)).toEqual(['58', '31']);
  });

  test('chips count every decision', () => {
    expect(foundChips(DISCOVERIES)).toEqual([
      { label: 'filed', count: 3 },
      { label: 'held', count: 10 },
      { label: 'dropped', count: 16 },
    ]);
  });

  test('a kind reads in sentence case, and no kind reads nothing', () => {
    expect(kindLabel('defect')).toBe('Defect');
    expect(kindLabel('follow-up')).toBe('Follow up');
    expect(kindLabel(null)).toBeNull();
  });
});

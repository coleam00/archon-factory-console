import { describe, expect, test } from 'bun:test';
import { displayItemKey, issueNumber } from './item-key';

describe('displayItemKey', () => {
  test('an issue key in either form reads #<number>', () => {
    expect(displayItemKey('issue-7')).toBe('#7');
    expect(displayItemKey('7')).toBe('#7');
    expect(issueNumber('issue-7')).toBe('7');
    expect(issueNumber('7')).toBe('7');
  });

  test('digits are kept as written', () => {
    expect(displayItemKey('007')).toBe('#007');
    expect(displayItemKey('issue-007')).toBe('#007');
  });

  test('any other key reads as it is', () => {
    for (const key of [
      'issue-7a',
      'issue-',
      'issue-x',
      '7a',
      'ISSUE-7',
      '#7',
      'pr-12',
      'abc',
      '',
    ]) {
      expect(displayItemKey(key)).toBe(key);
      expect(issueNumber(key)).toBeNull();
    }
  });
});

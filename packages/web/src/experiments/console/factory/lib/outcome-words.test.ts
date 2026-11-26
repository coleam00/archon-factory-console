import { expect, test } from 'bun:test';
import type { FactoryView } from '../api';
import { outcomeLabel, outcomeLabelsOf, outcomeWords } from './outcome-words';

const labels = outcomeLabelsOf({
  outcomes: {
    'build:ask': { label: 'asked you' },
    'build:*': { label: 'Build ended' },
    'check:pass': {},
  },
} as unknown as Pick<FactoryView, 'outcomes'>);

test('the labels leave out an entry with no label', () => {
  expect(labels).toEqual({ 'build:ask': 'asked you', 'build:*': 'Build ended' });
  expect(outcomeLabelsOf(null)).toEqual({});
});

test('an exact workflow:outcome label wins over workflow:*', () => {
  expect(outcomeWords(labels, 'build', 'ask')).toBe('asked you');
});

test('workflow:* words an outcome the file does not list', () => {
  expect(outcomeWords(labels, 'build', 'drop')).toBe('Build ended');
  expect(outcomeLabel(labels, 'build', null)).toBe('Build ended');
});

test('an outcome the file does not word reads as its value in words', () => {
  expect(outcomeWords(labels, 'check', 'send-back')).toBe('Send back');
  expect(outcomeLabel(labels, 'check', 'pass')).toBeUndefined();
});

test('a run no pack places skips the lookup', () => {
  expect(outcomeWords(labels, null, 'ask')).toBe('Ask');
});

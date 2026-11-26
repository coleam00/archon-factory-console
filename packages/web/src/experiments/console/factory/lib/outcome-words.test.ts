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

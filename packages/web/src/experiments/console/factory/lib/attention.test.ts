import { expect, test } from 'bun:test';
import { recommendedLabel } from './attention';
import { refAsk, unreadableItem } from './attention.test-fixtures';

test("an ask's recommended option reads its declared label; none is declared, none is shown", () => {
  expect(recommendedLabel(refAsk())).toBe('Use dev');
  expect(recommendedLabel(refAsk({ recommendation: undefined }))).toBeNull();
  // An option with no label is never shown by its raw id.
  const unlabelled = refAsk({ options: [{ id: 'use-dev' }] });
  expect(recommendedLabel(unlabelled)).not.toBe('use-dev');
  expect(recommendedLabel(unreadableItem())).toBeNull();
});

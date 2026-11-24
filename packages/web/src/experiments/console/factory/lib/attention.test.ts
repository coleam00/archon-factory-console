import { expect, test } from 'bun:test';
import { recommendedLabel } from './attention';
import { refAsk, unreadableItem } from './attention.test-fixtures';

test("an ask's recommended option reads its declared label; none is declared, none is shown", () => {
  // A label unlike its id, so a fall back to the id in words cannot pass.
  const labelled = refAsk({ options: [{ id: 'use-dev', label: 'Rebase onto dev' }] });
  expect(recommendedLabel(labelled)).toBe('Rebase onto dev');
  expect(recommendedLabel(refAsk({ recommendation: undefined }))).toBeNull();
  // An option with no label is never shown by its raw id.
  const unlabelled = refAsk({ options: [{ id: 'use-dev' }] });
  expect(recommendedLabel(unlabelled)).toBe('Use dev');
  expect(recommendedLabel(unreadableItem())).toBeNull();
});

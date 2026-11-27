import { describe, expect, test } from 'bun:test';
import { CheckoutCodebaseAmbiguousError } from '../services/codebase-checkout-resolver';
import { heldItemStartsNaming } from './held-item-starts';

describe('heldItemStartsNaming', () => {
  const start = (receiptId: string, cwd: string) => ({
    kind: 'trigger' as const,
    receiptId,
    bindingId: 'b',
    hostId: null,
    workflow: 'w',
    cwd,
    itemKey: `item-${receiptId}`,
    receivedAt: '2026-11-26T00:00:00.000Z',
  });
  const starts = [start('1', '/clear'), start('2', '/ambiguous'), start('3', '/clear')];
  const projectKeyOf = (fail: (cwd: string) => Error) => async (cwd: string) => {
    if (cwd === '/ambiguous') throw fail(cwd);
    return 'project';
  };
  const ambiguous = (cwd: string) =>
    new CheckoutCodebaseAmbiguousError(cwd, '/repo/.git', '/a, /b');

  test('a bulk read leaves out a start whose checkout is ambiguous and keeps the rest', async () => {
    const held = await heldItemStartsNaming(starts, () => true, projectKeyOf(ambiguous), true);
    expect(held.map(each => [each.receiptId, each.projectKey])).toEqual([
      ['1', 'project'],
      ['3', 'project'],
    ]);
  });

  test('any other failure, or an ambiguity where a decision depends on it, still throws', async () => {
    const other = (cwd: string) => new Error(`cannot read ${cwd}`);
    await expect(
      heldItemStartsNaming(starts, () => true, projectKeyOf(other), true)
    ).rejects.toThrow('cannot read /ambiguous');
    await expect(
      heldItemStartsNaming(starts, () => true, projectKeyOf(ambiguous), false)
    ).rejects.toBeInstanceOf(CheckoutCodebaseAmbiguousError);
  });
});

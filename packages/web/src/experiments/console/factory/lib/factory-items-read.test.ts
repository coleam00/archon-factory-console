import { expect, mock, test } from 'bun:test';
import type { FactoryItemsPage } from '../../skills/factory';
import { readEveryFactoryItem } from './factory-items-read';
import { capturedItemsPage } from './fixtures/factory-items-page';

const [first, second] = capturedItemsPage.items;
const page = (items: FactoryItemsPage['items'], next: string | null): FactoryItemsPage => ({
  pack: capturedItemsPage.pack,
  items,
  next,
});

test('follows next until the last page and keeps every item in order', async () => {
  const list = mock(async (opts: { codebaseId: string; after?: string }) =>
    opts.after === undefined ? page([first!], 'c1') : page([second!], null)
  );
  const items = await readEveryFactoryItem('cb-1', list);
  expect(items.map(item => item.item.key)).toEqual([first!.item.key, second!.item.key]);
  expect(list.mock.calls).toEqual([
    [{ codebaseId: 'cb-1' }],
    [{ codebaseId: 'cb-1', after: 'c1' }],
  ]);
});

test('fails the whole read when a later page fails', async () => {
  const list = mock(async (opts: { codebaseId: string; after?: string }) => {
    if (opts.after === undefined) return page([first!], 'c1');
    throw new Error('page two failed');
  });
  await expect(readEveryFactoryItem('cb-1', list)).rejects.toThrow('page two failed');
});

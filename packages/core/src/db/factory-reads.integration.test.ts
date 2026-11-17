// @archon-test-isolated
import { afterAll, mock, test } from 'bun:test';
import { SqliteAdapter, sqliteDialect } from './adapters/sqlite';
import { checkProjectItemsByActivity } from './factory-reads.conformance-harness';

const db = new SqliteAdapter(':memory:');
// The rest of the connection module stays real on purpose: the read only touches `pool`.
const connection = { ...(await import('./connection')) };
mock.module('./connection', () => ({
  ...connection,
  pool: db,
  getDatabase: () => db,
  getDialect: () => sqliteDialect,
  getDatabaseType: () => 'sqlite',
}));

afterAll(async () => {
  await db.close();
});

test('SQLite lists a project’s items with their latest run activity', async () => {
  const { listProjectItemsByActivity } = await import('./factory-reads');
  await checkProjectItemsByActivity(
    db,
    listProjectItemsByActivity,
    {
      conversation: 'conv-1',
      items: ['item-quiet', 'item-done', 'item-busy', 'item-other'],
      runs: ['run-1', 'run-2', 'run-3', 'run-4'],
    },
    // SQLite's own `datetime('now')` form: UTC, to the second, no zone.
    iso => iso.replace('T', ' ').replace(/Z$/, '')
  );
});

// @archon-test-isolated
import { mock, test } from 'bun:test';
import { Pool } from 'pg';
import { PostgresAdapter, postgresDialect } from './adapters/postgres';
import { checkProjectItemsByActivity } from './factory-reads.conformance-harness';

const baseUrl = process.env.ARCHON_TEST_PG_URL;
// The rest of the connection module stays real on purpose: the read only touches `pool`.
const connection = { ...(await import('./connection')) };

test.skipIf(!baseUrl)(
  'PostgreSQL lists a project’s items with their latest run activity',
  async () => {
    if (!baseUrl) throw new Error('ARCHON_TEST_PG_URL is required');
    const admin = new Pool({ connectionString: baseUrl });
    const scratchName = `archon_factory_reads_${crypto.randomUUID().replaceAll('-', '')}`;
    let db: PostgresAdapter | undefined;
    let created = false;
    try {
      await admin.query(`CREATE DATABASE "${scratchName}"`);
      created = true;
      const scratchUrl = new URL(baseUrl);
      scratchUrl.pathname = `/${scratchName}`;
      db = new PostgresAdapter(scratchUrl.toString());
      const adapter = db;
      mock.module('./connection', () => ({
        ...connection,
        pool: adapter,
        getDatabase: () => adapter,
        getDialect: () => postgresDialect,
        getDatabaseType: () => 'postgresql',
      }));
      const { listProjectItemsByActivity } = await import('./factory-reads');
      const id = (): string => crypto.randomUUID();
      await checkProjectItemsByActivity(
        adapter,
        listProjectItemsByActivity,
        {
          conversation: id(),
          items: [id(), id(), id(), id()],
          runs: [id(), id(), id(), id()],
        },
        iso => iso
      );
    } finally {
      await db?.close();
      if (created) await admin.query(`DROP DATABASE "${scratchName}"`);
      await admin.end();
    }
  },
  60_000
);

/**
 * An item's queued and skipped starts, read for many items at once, on both SQL stores.
 * Registered from `describeSqlStatusReadConformance`, so each backend's conformance test runs
 * it with its own harness factory.
 */
import { expect, test } from 'bun:test';
import {
  CONFORMANCE_CODEBASE_ID,
  CONFORMANCE_CONVERSATION_ID,
  resourceStartFixtures,
  type WorkflowStoreHarness,
} from '@archon/workflows/store-conformance';
import type { IDatabase } from './adapters/types';

export function describeItemStartReadConformance(
  makeHarness: () => Promise<WorkflowStoreHarness & { db: IDatabase }>
): void {
  test("items' queued and skipped starts are read for many items at once, each in queue order", async () => {
    const harness = await makeHarness();
    try {
      const { db, store } = harness;
      const itemId = async (key: string): Promise<string> => {
        const inserted = await db.query<{ id: string }>(
          "INSERT INTO remote_agent_items (project_key, key) VALUES ('acme/web', $1) RETURNING id",
          [key]
        );
        return inserted.rows[0]?.id ?? '';
      };
      const [x, k1, idle] = [await itemId('x'), await itemId('k1'), await itemId('idle')];
      const { start } = resourceStartFixtures(CONFORMANCE_CODEBASE_ID, CONFORMANCE_CONVERSATION_ID);
      const holder = start();
      const before = start();
      const elsewhere = start('queue', 'other-host');
      const otherHolder = { ...start(), resource: 'other' };
      const otherResource = { ...start(), resource: 'other' };
      const waiting = start();
      const refused = start('skip');
      const refusedLater = start('skip');
      expect(await store.admitResourceStart(holder)).toMatchObject({ status: 'admitted' });
      expect(await store.admitResourceStart(refused)).toMatchObject({ status: 'skipped' });
      expect(await store.admitResourceStart(before)).toMatchObject({ status: 'queued' });
      expect(await store.admitResourceStart(elsewhere)).toMatchObject({ status: 'queued' });
      expect(await store.admitResourceStart(otherHolder)).toMatchObject({ status: 'admitted' });
      expect(await store.admitResourceStart(otherResource)).toMatchObject({ status: 'queued' });
      expect(await store.admitResourceStart(waiting)).toMatchObject({ status: 'queued' });
      expect(await store.admitResourceStart(refusedLater)).toMatchObject({ status: 'skipped' });
      // Preparation writes a start's item onto its request; these starts have no receipt.
      for (const [intent, item] of [
        [before, x],
        [waiting, k1],
        [refused, k1],
        [refusedLater, k1],
      ] as const)
        await db.query(
          'UPDATE remote_agent_resource_start_requests SET item_id = $1 WHERE id = $2',
          [item, intent.launch.run.id]
        );

      // `before` is ahead on the same resource and host. `elsewhere` (another host) and
      // `otherResource` (another resource) queued earlier and are not counted.
      // Every asked item is a key, in the order asked, with none when it has none.
      const queued = await store.listQueuedItemStarts([k1, idle, x]);
      expect([...queued.keys()]).toEqual([k1, idle, x]);
      expect(queued.get(k1)).toEqual([
        {
          requestId: waiting.launch.run.id,
          workflow: 'conformance',
          resource: 'resource',
          hostId: 'host',
          queuedAt: expect.stringMatching(/Z$/),
          ahead: 1,
        },
      ]);
      expect(queued.get(idle)).toEqual([]);
      expect(queued.get(x)).toMatchObject([{ requestId: before.launch.run.id, ahead: 0 }]);
      expect(await store.listQueuedItemStarts([])).toEqual(new Map());

      const skipped = await store.listSkippedItemStarts([idle, k1]);
      expect([...skipped.keys()]).toEqual([idle, k1]);
      expect(skipped.get(idle)).toEqual([]);
      // Oldest first. A start refused behind a run names it; one refused behind a queued
      // request names none.
      const refusal = { workflow: 'conformance', resource: 'resource' };
      expect(skipped.get(k1)).toEqual([
        { ...refusal, requestId: refused.launch.run.id, blockerRunId: holder.launch.run.id },
        { ...refusal, requestId: refusedLater.launch.run.id, blockerRunId: null },
      ]);
      expect(await store.listSkippedItemStarts([])).toEqual(new Map());

      // Once admitted, a start has a run and leaves the list.
      await store.claimPendingWorkflowRun(holder.launch.run.id);
      await store.completeWorkflowRun(holder.launch.run.id, { duration_ms: 1 });
      await store.drainResourceStarts({ resource: 'resource', hostId: 'host' });
      const drained = await store.listQueuedItemStarts([x, k1]);
      expect(drained.get(x)).toEqual([]);
      expect(drained.get(k1)).toMatchObject([{ requestId: waiting.launch.run.id, ahead: 0 }]);
    } finally {
      await harness.close();
    }
  });
}

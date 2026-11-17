/**
 * The factory section's project item listing, on both SQL stores. Each backend's
 * integration test routes `./connection` to its scratch database and calls this.
 */
import { expect } from 'bun:test';
import type { IDatabase } from './adapters/types';

/**
 * Seeds two projects' items and runs through `db`, then reads one project with `list`.
 * Times are written as `stored` renders them: the format the dialect itself records, so
 * SQLite's second-precision text is what the read compares.
 */
export async function checkProjectItemsByActivity(
  db: IDatabase,
  list: (projectKey: string) => Promise<{ id: string; key: string; activityAt: string }[]>,
  ids: { conversation: string; items: [string, string, string, string]; runs: string[] },
  stored: (iso: string) => string
): Promise<void> {
  const [quiet, done, busy, other] = ids.items;
  await db.query(
    "INSERT INTO remote_agent_conversations (id, platform_type, platform_conversation_id) VALUES ($1, 'web', 'factory-reads')",
    [ids.conversation]
  );
  const item = (id: string, project: string, key: string, created: string): Promise<unknown> =>
    db.query(
      'INSERT INTO remote_agent_items (id, project_key, key, created_at) VALUES ($1, $2, $3, $4)',
      [id, project, key, stored(created)]
    );
  await item(quiet, 'acme/web', '1', '2026-11-16T09:00:00Z');
  await item(done, 'acme/web', '2', '2026-11-16T09:00:01Z');
  await item(busy, 'acme/web', '3', '2026-11-16T09:00:02Z');
  await item(other, 'acme/api', '1', '2026-11-16T09:00:03Z');
  const run = (
    id: string,
    itemId: string,
    times: { started: string; activity: string | null; completed: string | null }
  ): Promise<unknown> =>
    db.query(
      `INSERT INTO remote_agent_workflow_runs
         (id, conversation_id, workflow_name, user_message, status, item_id, started_at, last_activity_at, completed_at)
       VALUES ($1, $2, 'deliver', '', 'completed', $3, $4, $5, $6)`,
      [
        id,
        ids.conversation,
        itemId,
        stored(times.started),
        times.activity === null ? null : stored(times.activity),
        times.completed === null ? null : stored(times.completed),
      ]
    );
  const [first, second, running, foreign] = ids.runs as [string, string, string, string];
  // `done` ran twice; its later run's end is its activity.
  await run(first, done, {
    started: '2026-11-16T10:00:00Z',
    activity: null,
    completed: '2026-11-16T10:30:00Z',
  });
  await run(second, done, {
    started: '2026-11-16T11:00:00Z',
    activity: '2026-11-16T11:10:00Z',
    completed: '2026-11-16T11:20:00Z',
  });
  // `busy` is still going; its last activity counts.
  await run(running, busy, {
    started: '2026-11-16T12:00:00Z',
    activity: '2026-11-16T12:05:00Z',
    completed: null,
  });
  await run(foreign, other, { started: '2026-11-16T13:00:00Z', activity: null, completed: null });

  const listed = (await list('acme/web')).sort((a, b) => a.key.localeCompare(b.key));
  expect(listed).toEqual([
    // No runs: the item's creation.
    { id: quiet, key: '1', activityAt: '2026-11-16T09:00:00.000Z' },
    { id: done, key: '2', activityAt: '2026-11-16T11:20:00.000Z' },
    { id: busy, key: '3', activityAt: '2026-11-16T12:05:00.000Z' },
  ]);
  expect(await list('nobody/here')).toEqual([]);
}

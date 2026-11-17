/**
 * Read-only queries for the console's Software Factory section. A module of its own, outside
 * the `./workflows` entry, so the many tests that mock that entry need not know about it.
 */
import { createLogger } from '@archon/paths';
import { pool } from './connection';
import { toHydratedTimestamp } from './timestamps';

/** Lazy-initialized logger (deferred so test mocks can intercept createLogger) */
let cachedLog: ReturnType<typeof createLogger> | undefined;
function getLog(): ReturnType<typeof createLogger> {
  if (!cachedLog) cachedLog = createLogger('db.factory');
  return cachedLog;
}

/**
 * Which of `names` this codebase has at least one run of, in any status. A caller asks about
 * the handful of workflows a factory view names, well below the bound-parameter limits.
 */
export async function listRunWorkflowNames(
  codebaseId: string,
  names: readonly string[]
): Promise<string[]> {
  const unique = [...new Set(names)];
  if (unique.length === 0) return [];
  const placeholders = unique.map((_, index) => `$${String(index + 2)}`).join(', ');
  try {
    const result = await pool.query<{ workflow_name: string }>(
      `SELECT DISTINCT workflow_name FROM remote_agent_workflow_runs WHERE codebase_id = $1 AND workflow_name IN (${placeholders})`,
      [codebaseId, ...unique]
    );
    return result.rows.map(row => row.workflow_name);
  } catch (error) {
    const err = error as Error;
    getLog().error({ err }, 'db.workflow_run_names_list_failed');
    throw new Error(`Failed to list run workflow names: ${err.message}`);
  }
}

/**
 * Every item of project `projectKey` with its latest run activity: the latest of its runs'
 * end, last activity or start, else when the item was created. A factory has tens to
 * hundreds of items, so this reads them all and the caller pages; no keyset SQL to keep
 * in two dialects. Only an item's own runs carry `item_id`, so children do not count.
 */
export async function listProjectItemsByActivity(
  projectKey: string
): Promise<{ id: string; key: string; activityAt: string }[]> {
  try {
    const result = await pool.query<{
      id: string;
      key: string;
      created_at: Date | string;
      activity: Date | string | null;
    }>(
      `SELECT i.id, i.key, i.created_at,
         MAX(COALESCE(r.completed_at, r.last_activity_at, r.started_at)) AS activity
       FROM remote_agent_items i
       LEFT JOIN remote_agent_workflow_runs r ON r.item_id = i.id
       WHERE i.project_key = $1
       GROUP BY i.id, i.key, i.created_at`,
      [projectKey]
    );
    return result.rows.map(row => ({
      id: String(row.id),
      key: row.key,
      activityAt: toHydratedTimestamp(row.activity ?? row.created_at).toISOString(),
    }));
  } catch (error) {
    const err = error as Error;
    getLog().error({ err }, 'db.project_items_list_failed');
    throw new Error(`Failed to list project items: ${err.message}`);
  }
}

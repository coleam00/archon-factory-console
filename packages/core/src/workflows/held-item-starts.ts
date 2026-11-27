/**
 * Which item each held binding start names, for the store adapter's held-start reads. Its own
 * module so a test reaches it without the adapter's database and provider imports.
 */
import { createLogger } from '@archon/paths';
import type { HeldStart } from '@archon/workflows/resource-start-store';
import type { IWorkflowStore } from '@archon/workflows/store';
import { CheckoutCodebaseAmbiguousError } from '../services/codebase-checkout-resolver';

let cachedLog: ReturnType<typeof createLogger> | undefined;
function getLog(): ReturnType<typeof createLogger> {
  if (!cachedLog) cachedLog = createLogger('workflow.held-item-starts');
  return cachedLog;
}

/**
 * The held binding starts in `starts` whose item key `keyMatches`, each with the item it
 * names. A binding is resolved to a project only when it is prepared, so its checkout decides
 * the project here the way it will then; only a start whose key matches is resolved. With
 * `skipAmbiguous`, a start whose checkout matches more than one registered codebase is logged
 * and left out, so one such checkout cannot fail a read of every item; any other failure
 * still throws (#286).
 */
export async function heldItemStartsNaming(
  starts: readonly HeldStart[],
  keyMatches: (itemKey: string) => boolean,
  projectKeyOf: (cwd: string) => Promise<string | null>,
  skipAmbiguous: boolean
): ReturnType<IWorkflowStore['listAllHeldItemStarts']> {
  const held: Awaited<ReturnType<IWorkflowStore['listAllHeldItemStarts']>> = [];
  for (const start of starts) {
    if (start.kind !== 'trigger' || start.itemKey === null || start.cwd === null) continue;
    if (!keyMatches(start.itemKey)) continue;
    const { receiptId, bindingId, hostId, workflow, receivedAt, itemKey, cwd } = start;
    let projectKey: string | null;
    try {
      projectKey = await projectKeyOf(cwd);
    } catch (error) {
      if (!skipAmbiguous || !(error instanceof CheckoutCodebaseAmbiguousError)) throw error;
      getLog().warn({ err: error, receiptId, cwd }, 'held_start_project_ambiguous');
      continue;
    }
    if (projectKey !== null)
      held.push({ receiptId, bindingId, hostId, workflow, receivedAt, itemKey, projectKey });
  }
  return held;
}

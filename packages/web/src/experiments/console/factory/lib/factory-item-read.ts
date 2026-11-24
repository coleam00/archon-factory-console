/**
 * One item whole for its page: Archon's item read (`GET /api/items`), its progress as the board
 * derives it (`factory-derive.ts`), and for each of its runs what its story tells: the run's
 * facts, what it said at the view's `story.said` pointers, and, from Archon's run detail, the
 * models it ran on and when each step started.
 */
import { getRunDetail } from '../api';
import type { FactoryItemDetail, FactoryItemRun } from './progress-types';
import type { WithinDeadline } from './deadline';
import {
  factsOf,
  forgeRead,
  itemIssue,
  lookupsOf,
  recordFields,
  recordsOf,
  type DeriveReads,
} from './factory-derive';
import type { FactoryItemsReads } from './factory-items-read';
import { itemProgress, namedWorkflow } from './item-progress';
import { resultString } from './run-facts';
import { runStory } from './run-story';

export interface FactoryItemReads extends DeriveReads {
  getItem: FactoryItemsReads['getItem'];
  getRunDetail: typeof getRunDetail;
  view: FactoryItemsReads['view'];
}

/** The item `key` names, with what each of its runs tells; a 404 from the item read when none. */
export async function readFactoryItem(
  codebaseId: string,
  key: string,
  reads: FactoryItemReads,
  within: WithinDeadline
): Promise<FactoryItemDetail & { titlesPending: boolean }> {
  const item = await within(signal => reads.getItem({ project: codebaseId, key }, { signal }));
  const view = await reads.view(codebaseId, within);
  if (view === undefined) {
    const runs = item.runs.map(
      (run): FactoryItemRun => ({
        runId: run.id,
        workflow: null,
        costUsd: run.spend.usd,
        step: null,
        rounds: null,
        change: null,
        said: null,
        models: [],
        steps: [],
      })
    );
    return { item: { ...item, progress: null }, runs, titlesPending: false };
  }
  const [records, details] = await Promise.all([
    recordsOf(item.runs, recordFields(view), reads, within),
    Promise.all(item.runs.map(run => within(signal => reads.getRunDetail(run.id, { signal })))),
  ]);
  const facts = factsOf(view, [item], records);
  const lookup = lookupsOf(view, [item], facts).get(key);
  const issue = itemIssue(key);
  const forge = await forgeRead(
    codebaseId,
    issue === null ? [] : [issue],
    lookup === undefined ? [] : [lookup],
    reads,
    within
  );
  const title = issue === null ? null : (forge.titles.get(issue) ?? null);
  const progress = itemProgress(view, item, facts, { title, changes: forge.changes });
  const said = view.declaration.story?.said ?? [];
  const runs = item.runs.map((run, index): FactoryItemRun => {
    const fact = facts.get(run.id);
    const record = records.get(run.id);
    const detail = details[index];
    return {
      runId: run.id,
      workflow: namedWorkflow(view, run.workflow),
      costUsd: run.spend.usd,
      step: run.status === 'running' ? (fact?.active ?? null) : null,
      rounds: fact?.rounds ?? null,
      change: fact?.change?.url ?? null,
      said:
        record === undefined
          ? null
          : (said.map(pointer => resultString(pointer, run, record)).find(Boolean) ?? null),
      ...(detail === undefined ? { models: [], steps: [] } : runStory(detail)),
    };
  });
  return { item: { ...item, progress }, runs, titlesPending: forge.titlesPending };
}

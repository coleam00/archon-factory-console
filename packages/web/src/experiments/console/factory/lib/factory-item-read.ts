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

type ItemRun = FactoryItemDetail['item']['runs'][number];
type RunStory = Pick<FactoryItemRun, 'models' | 'steps'>;

/**
 * Ended runs' stories, kept for the page's life, so a refresh reads the detail (every event)
 * only of runs still going. Keyed by status and end time: a failed run can resume and end again.
 */
const keptStories = new Map<string, RunStory>();
const KEPT_STORIES = 500;
const ENDED: ReadonlySet<string> = new Set(['completed', 'failed', 'cancelled']);

async function storyOf(
  run: ItemRun,
  reads: Pick<FactoryItemReads, 'getRunDetail'>,
  within: WithinDeadline
): Promise<RunStory> {
  const key = ENDED.has(run.status) ? `${run.id}|${run.status}|${run.completedAt ?? ''}` : null;
  const kept = key === null ? undefined : keptStories.get(key);
  if (kept !== undefined) return kept;
  const detail = await within(signal => reads.getRunDetail(run.id, { signal }));
  const story = runStory(detail);
  if (key !== null && detail.run.status === run.status) {
    keptStories.set(key, story);
    for (const oldest of keptStories.keys()) {
      if (keptStories.size <= KEPT_STORIES) break;
      keptStories.delete(oldest);
    }
  }
  return story;
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
  const [records, stories] = await Promise.all([
    recordsOf(item.runs, recordFields(view), reads, within),
    Promise.all(item.runs.map(run => storyOf(run, reads, within))),
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
    const story = stories[index];
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
      ...(story ?? { models: [], steps: [] }),
    };
  });
  return { item: { ...item, progress }, runs, titlesPending: forge.titlesPending };
}

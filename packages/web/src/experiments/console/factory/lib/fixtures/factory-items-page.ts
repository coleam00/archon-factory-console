import type { FactoryItem, ItemRead, RunRecord } from '../../api';
import { shippedListed, shippedView } from '../../item-detail.test-fixtures';
import { forgetRunRecords } from '../factory-derive';
import { declaredWorkflow } from '../item-progress';
import { issueNumber } from '../item-key';
import { DELIVER_AFTER_PLAN, realItem } from '../map.test-fixtures';

type Progress = NonNullable<FactoryItem['progress']>;

/** Real item `key` cut to its run `runId`, in the read and in its progress, with `progress`. */
function onlyRun(key: string, runId: string, progress: Partial<Progress>): FactoryItem {
  const item = realItem(key);
  const run = item.runs.find(entry => entry.id === runId);
  if (run === undefined) throw new Error(`item ${key} has no run ${runId}`);
  return {
    ...item,
    runs: [run],
    progress: {
      ...(item.progress as Progress),
      runs: [{ runId, workflow: 'deliver', failedStep: null }],
      ...progress,
    },
  };
}

/** A deliver run on `build__build`, started at `startedAt`. */
const onBuild = (runId: string, startedAt: string): Progress['running'] => ({
  runId,
  workflow: 'deliver',
  step: 'build__build',
  startedAt,
});

const item6 = onlyRun('6', '585ed621-5f63-4148-bb95-92cfb4c7f52a', {
  running: onBuild('585ed621-5f63-4148-bb95-92cfb4c7f52a', '2026-11-17T05:51:11.000Z'),
  round: null,
  returned: 0,
});

/**
 * #12 is not in the copy: it is #6 renamed, its one deliver run started by another run's end,
 * as item 12 was on 2026-11-17. That run (5da88866) is in no capture, so the arrow id is
 * assumed to be plan's, as every other deliver run's here.
 */
const item12: FactoryItem = {
  ...item6,
  item: { ...item6.item, id: 'b67699236409b5c74dff09dd0cf85507', key: '12' },
  runs: item6.runs.map(run => ({
    ...run,
    id: 'c9773ff3-36bf-413e-a3b3-45ce93a77087',
    startedAt: '2026-11-17T06:41:56.000Z',
    cause: {
      kind: 'run_ended',
      runId: '5da88866-18d3-4045-9019-2a11d45899aa',
      sourceInstanceId: DELIVER_AFTER_PLAN,
    },
  })),
  progress: {
    ...(item6.progress as Progress),
    title: 'Stage and step pages show which items are on a step now',
    running: onBuild('c9773ff3-36bf-413e-a3b3-45ce93a77087', '2026-11-17T06:41:56.000Z'),
    runs: [
      { runId: 'c9773ff3-36bf-413e-a3b3-45ce93a77087', workflow: 'deliver', failedStep: null },
    ],
  },
};

/**
 * Items as the console reads them (each read joined with its progress), from the map's copy
 * (`map.test-fixtures.ts`): three deliver runs on `build__build` and one idle item, each cut
 * to one run. #4 carries the round its previous run ended in (returned, then an ask); #5 is
 * cut to its run that ended on an ask, before its next one started.
 */
export const capturedItemsPage: { items: FactoryItem[] } = {
  items: [
    item12,
    onlyRun('4', '624c763f-4f33-46ea-aa65-bb1ba78c1eec', {
      running: onBuild('624c763f-4f33-46ea-aa65-bb1ba78c1eec', '2026-11-17T06:44:47.000Z'),
      round: {
        runId: 'fdef09db-c751-43a0-9eb5-c6386b8f8b60',
        iteration: 2,
        max: 3,
        rounds: [
          { iteration: 1, verdict: 'returned', outcome: 'return' },
          { iteration: 2, verdict: 'undecided', outcome: 'ask' },
        ],
      },
    }),
    item6,
    onlyRun('5', 'f4e603d9-bdeb-4614-a411-77e76eb77777', { running: null }),
  ],
};

/**
 * A captured item renamed `key` with its progress replaced, for the states the capture does
 * not hold: a run between a loop's bodies, a run between steps, another workflow, no progress.
 */
export function capturedItemAs(
  key: string,
  progress: { running: Progress['running'] } | null,
  base: FactoryItem = capturedItemsPage.items[0] as FactoryItem
): FactoryItem {
  // The running run is the item's: its first run takes the id and is running.
  const running = progress?.running ?? null;
  return {
    ...base,
    item: { ...base.item, id: `${base.item.id}-${key}`, key },
    runs: base.runs.map((run, index) =>
      running !== null && index === 0
        ? { ...run, id: running.runId, status: 'running' as const, completedAt: null }
        : run
    ),
    progress: progress === null ? null : { ...(base.progress as Progress), ...progress },
  };
}

/** The run that names an item's change: its latest run of a workflow a `change` source lists. */
function changeRun(item: FactoryItem): string | null {
  const sources = new Set([shippedView.change ?? []].flat().map(source => source.workflow));
  const runs = [...item.runs].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  return (
    runs.find(run => {
      const workflow = declaredWorkflow(shippedListed, run.workflow);
      return workflow !== null && sources.has(workflow);
    })?.id ?? null
  );
}

const changeKey = (): string =>
  ([shippedView.change ?? []].flat()[0]?.pointer ?? '/change').slice(1);

const orderRunId = (item: FactoryItem): string => `order-${item.item.id}`;

/**
 * The item's read as the window gives it. An item whose progress names a work order gets the
 * run that put it there: a run of the view's `partOf` workflow, completed with its outcome,
 * before its first run.
 */
function readOf(item: FactoryItem): ItemRead {
  const { progress, ...read } = item;
  const partOf = shippedView.partOf;
  const first = [...read.runs].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))[0];
  if (progress?.partOf == null || partOf === undefined || first === undefined) return read;
  const at = new Date(Date.parse(first.startedAt) - 60_000).toISOString();
  const order = {
    ...first,
    id: orderRunId(item),
    workflow: shippedListed.runNames[partOf.workflow] ?? partOf.workflow,
    status: 'completed' as const,
    outcome: partOf.outcome,
    startedAt: at,
    completedAt: at,
  };
  return { ...read, runs: [order, ...read.runs] };
}

/**
 * The record a run's progress was derived from, as far as the board reads it: the step it
 * runs, the step it failed at, and the change it named. Rounds, returns and held items are
 * read from real records in `run-facts.test.ts`, not rebuilt here.
 */
function recordOf(item: FactoryItem, run: FactoryItem['runs'][number]): RunRecord {
  const progress = item.progress;
  const failed = progress?.runs.find(entry => entry.runId === run.id)?.failedStep ?? null;
  const step = progress?.running?.runId === run.id ? progress.running.step : null;
  const change = progress?.change != null && changeRun(item) === run.id ? progress.change : null;
  const value: Record<string, string> = {};
  if (change !== null) value[changeKey()] = change.url ?? '';
  if (run.id === orderRunId(item) && progress?.partOf != null && shippedView.partOf !== undefined)
    value[shippedView.partOf.pointer.slice(1)] = progress.partOf;
  return {
    id: run.id,
    status: run.status,
    completed_at: run.completedAt,
    ...(Object.keys(value).length === 0
      ? {}
      : { returns: { availability: 'available' as const, node_id: 'end', value } }),
    node_outcomes: { run_id: run.id, first_failed_node: failed, nodes: [] },
    loop_iterations: [],
    running: step === null ? [] : [step],
  };
}

/**
 * What a stubbed server answers to the items read for `items`: Archon's generic reads (a
 * window page of their reads, their runs' records, each item by key, and what the forge says
 * of their issues and changes), each answered as the items' progress says, and the shipped
 * view when the test serves none.
 */
export function itemsReadAnswer(items: readonly FactoryItem[]): (url: string) => Response {
  // Records kept from another test's items would answer for these.
  forgetRunRecords();
  return url => {
    const query = new URL(url, 'http://test').searchParams;
    if (url.includes('/api/factory/views'))
      return Response.json({ views: [shippedListed], errors: [] });
    if (url.includes('/api/workflows/runs/records')) {
      const ids = new Set(query.getAll('runId'));
      return Response.json({
        records: items.flatMap(item =>
          readOf(item)
            .runs.filter(run => ids.has(run.id))
            .map(run => recordOf(item, run))
        ),
        missing: [],
        unreadable: [],
      });
    }
    if (url.includes('/api/forge/subjects')) {
      const runs = new Set([...query.getAll('changeRun'), ...query.getAll('branchRun')]);
      const issues = query.getAll('issue').map(Number);
      return Response.json({
        issues: issues.map(number => {
          const item = items.find(entry => issueNumber(entry.item.key) === String(number));
          return {
            number,
            title: item?.progress?.title ?? null,
            state: null,
            url: null,
            pending: false,
          };
        }),
        changes: items.flatMap(item => {
          const run = changeRun(item);
          const change = item.progress?.change;
          return run !== null && runs.has(run) && change != null ? [{ run, ...change }] : [];
        }),
      });
    }
    if (url.includes('/api/items?')) {
      const found = items.find(item => item.item.key === query.get('key'));
      if (found === undefined) return Response.json({ error: 'No item' }, { status: 404 });
      return Response.json(readOf(found));
    }
    return Response.json({
      window: { since: '1970-01-01T00:00:00.000Z', until: '2026-11-17T12:00:00.000Z' },
      items: items.map(readOf),
      next: null,
    });
  };
}

/** Whether a stubbed server's `url` is one of the items read's requests. */
export const isItemsRead = (url: string): boolean =>
  ['/api/items', '/api/workflows/runs/records', '/api/forge/subjects', '/api/factory/views'].some(
    path => url.includes(path)
  );

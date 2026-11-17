/**
 * A page of a project's items for a factory view: each item's engine read (`ItemRead`) plus
 * the progress the board needs and the item read does not carry. Progress is derived from
 * the engine's own records through the view's declaration (`rounds`, `returns`, `change`,
 * `itemTitle`); nothing here stores a position or names a pack's steps.
 *
 * The derivation is pure (`factoryRunFacts`, `factoryItemProgress`, `pageFactoryItems`);
 * `readFactoryItemsPage` reads the store once per page and feeds them. Whether a change
 * merged is the caller's lookup (`changeState`), since only the server reaches the forge.
 */
import { z } from 'zod';
import { listAttentionQueue } from './attention-queue';
import { factoryRunWorkflowName } from './factory-views';
import { assembleItemRead, itemReadSchema, readItemRuns, type ItemReadSource } from './item-read';
import { resolveJsonPointer } from './json-pointer';
import { MetricsQueryError, resolveMetricsWindow } from './metrics';
import type { JsonValue } from './output-ref';
import { splitAttentionRead } from './schemas/attention-degraded';
import type { FactoryView } from './schemas/factory-view';
import { readSubrunMetadata } from './schemas/run-metadata';
import { isTerminalRunStatus } from './schemas/run-status';
import type { WorkflowEventRow } from './schemas/workflow-event';
import type { WorkflowRun } from './schemas/workflow-run';
import {
  foldActiveNodeIds,
  NODE_STATE_EVENT_TYPES,
  type NodeStateEventType,
  type WorkflowEventType,
} from './store/event-types';
import { buildNodeOutcomes, getTerminalRecord } from './terminal-record';

/** How one round of the declared rounds loop ended, from declared data only. */
export const factoryRoundVerdictSchema = z.enum(['returned', 'passed', 'running', 'stopped']);
export type FactoryRoundVerdict = z.infer<typeof factoryRoundVerdictSchema>;

/** Whether the change merged, as the change host reported it; `unknown` when it could not say. */
export const factoryChangeMergedSchema = z.union([z.boolean(), z.literal('unknown')]);
export type FactoryChangeMerged = z.infer<typeof factoryChangeMergedSchema>;

export const factoryItemProgressSchema = z.object({
  /** The declared run input's first line, without a leading `#<n> `; null when no run carries it. */
  title: z.string().nullable(),
  /** The latest-started running run of a declared workflow; null when none runs. */
  running: z
    .object({
      runId: z.string(),
      /** The workflow as the view declares it, not as the run records it. */
      workflow: z.string(),
      /** The deepest running step; null between steps. */
      step: z.string().nullable(),
      startedAt: z.string().datetime(),
    })
    .nullable(),
  /** The declared rounds loop on the latest run of its workflow that entered it. */
  round: z
    .object({
      runId: z.string(),
      iteration: z.number().int().positive(),
      /** The loop's bound as its latest round recorded it; null when it recorded none. */
      max: z.number().int().positive().nullable(),
      rounds: z.array(
        z.object({ iteration: z.number().int().positive(), verdict: factoryRoundVerdictSchema })
      ),
    })
    .nullable(),
  /** How many times a declared return point sent the item back, across all its runs. */
  returned: z.number().int().nonnegative(),
  /** The change at the declared result pointer of the latest run that has one. */
  change: z
    .object({
      url: z.string(),
      merged: factoryChangeMergedSchema,
      mergedAt: z.string().nullable(),
    })
    .nullable(),
});
export type FactoryItemProgress = z.infer<typeof factoryItemProgressSchema>;

export const factoryItemSchema = itemReadSchema.extend({
  /** Null when this item's progress could not be derived; the rest of the read stands. */
  progress: factoryItemProgressSchema.nullable(),
});
export type FactoryItem = z.infer<typeof factoryItemSchema>;

export const factoryItemsPageSchema = z.object({
  /** The pack whose view the progress was derived with. */
  pack: z.string(),
  /** Newest activity first. */
  items: z.array(factoryItemSchema),
  /** Pass as `after` for the next page; null when there is none. */
  next: z.string().nullable(),
});
export type FactoryItemsPage = z.infer<typeof factoryItemsPageSchema>;

/** A query the caller sent that cannot be answered as asked: the caller's 400. */
export class FactoryItemsQueryError extends Error {}

/** What one run of a declared workflow contributes to its item's progress. */
export interface FactoryRunFacts {
  /** The deepest running step, as of the run's events; null when none runs. */
  active: string | null;
  /** The declared rounds loop's rounds on this run; null when the run is not of that workflow. */
  rounds: {
    max: number | null;
    rounds: { iteration: number; verdict: FactoryRoundVerdict }[];
  } | null;
  returnCount: number;
  /** The change at the declared pointer, with the run's forge audit rows; null when none. */
  change: { url: string; audits: unknown[] } | null;
}

/** The event types `factoryRunFacts` reads. */
export const FACTORY_RUN_FACT_EVENT_TYPES: readonly WorkflowEventType[] = [
  ...NODE_STATE_EVENT_TYPES,
  'loop_iteration_started',
  'loop_iteration_completed',
  'workflow_completed',
  'integration_operation',
];

/** The workflow a view declares that a run of `recorded` (as runs record it) is; null when none. */
export function declaredWorkflow(view: FactoryView, pack: string, recorded: string): string | null {
  for (const stage of view.stages)
    for (const workflow of stage.workflows)
      if (factoryRunWorkflowName(pack, workflow) === recorded) return workflow;
  return null;
}

const NODE_STATE_TYPES: ReadonlySet<string> = new Set(NODE_STATE_EVENT_TYPES);

/**
 * The deepest step running: the dashboard's fold over node state, then the step with the
 * most `.`-separated segments (a loop body inside its group), ties to the latest started,
 * then by id.
 */
function deepestActiveStep(events: readonly WorkflowEventRow[]): string | null {
  const active = new Set<string>();
  const startedAt = new Map<string, number>();
  for (const [index, row] of events.entries()) {
    if (!NODE_STATE_TYPES.has(row.event_type)) continue;
    foldActiveNodeIds(active, row.step_name, row.event_type as NodeStateEventType);
    if (row.event_type === 'node_started' && row.step_name)
      startedAt.set(row.step_name, row.event_order ?? index);
  }
  const depth = (step: string): number => step.split('.').length;
  const [deepest] = [...active].sort(
    (a, b) =>
      depth(b) - depth(a) ||
      (startedAt.get(b) ?? -1) - (startedAt.get(a) ?? -1) ||
      a.localeCompare(b)
  );
  return deepest ?? null;
}

const loopRowSchema = z.object({
  iteration: z.number().int().positive(),
  maxIterations: z.number().int().positive().optional(),
});

/** The structured output's `outcome`, when the output is an object that has one. */
function outputOutcome(output: unknown): unknown {
  return typeof output === 'object' && output !== null && 'outcome' in output
    ? output.outcome
    : undefined;
}

type Outcomes = ReturnType<typeof buildNodeOutcomes>['nodes'];
type ReturnPoint = NonNullable<FactoryView['returns']>[number];

function returnsIn(outcomes: Outcomes, point: ReturnPoint): Outcomes {
  return outcomes.filter(
    entry => entry.node_id === point.node && outputOutcome(entry.output) === point.outcome
  );
}

function roundFacts(
  loop: string,
  points: readonly ReturnPoint[],
  run: WorkflowRun,
  events: readonly WorkflowEventRow[],
  outcomes: Outcomes
): NonNullable<FactoryRunFacts['rounds']> {
  const started = new Map<number, number | undefined>();
  const completed = new Set<number>();
  for (const row of events) {
    if (row.step_name !== loop) continue;
    const parsed = loopRowSchema.safeParse(row.data);
    if (!parsed.success) continue;
    if (row.event_type === 'loop_iteration_started')
      started.set(parsed.data.iteration, parsed.data.maxIterations);
    else if (row.event_type === 'loop_iteration_completed') completed.add(parsed.data.iteration);
  }
  const bodyPoints = points.filter(point => point.node.startsWith(`${loop}.`));
  const returnedIn = new Set(
    bodyPoints.flatMap(point =>
      returnsIn(outcomes, point).flatMap(
        entry =>
          entry.loop_group_path?.filter(frame => frame.groupId === loop).map(f => f.iteration) ?? []
      )
    )
  );
  const ended = isTerminalRunStatus(run.status);
  const iterations = [...started.keys()].sort((a, b) => a - b);
  const rounds = iterations.map(iteration => ({
    iteration,
    verdict: returnedIn.has(iteration)
      ? ('returned' as const)
      : !completed.has(iteration)
        ? ended
          ? ('stopped' as const)
          : ('running' as const)
        : ('passed' as const),
  }));
  const last = iterations.at(-1);
  return { max: (last === undefined ? undefined : started.get(last)) ?? null, rounds };
}

function changeFacts(
  pointer: string,
  run: WorkflowRun,
  events: readonly WorkflowEventRow[]
): FactoryRunFacts['change'] {
  const record = getTerminalRecord(run.status, events);
  if (record?.returns.availability !== 'available') return null;
  const url = resolveJsonPointer(record.returns.value as JsonValue, pointer);
  if (typeof url !== 'string') return null;
  const audits = events
    .filter(row => row.event_type === 'integration_operation')
    .map(row => row.data);
  return { url, audits };
}

/**
 * What one run of a workflow `view` declares contributes to its item's progress, from the
 * run's events (`FACTORY_RUN_FACT_EVENT_TYPES`, in append order).
 */
export function factoryRunFacts(
  view: FactoryView,
  pack: string,
  run: WorkflowRun,
  events: readonly WorkflowEventRow[]
): FactoryRunFacts {
  const workflow = declaredWorkflow(view, pack, run.workflow_name);
  const points = (view.returns ?? []).filter(point => point.workflow === workflow);
  const outcomes = buildNodeOutcomes(run, events).nodes;
  return {
    active: deepestActiveStep(events),
    rounds:
      view.rounds !== undefined && view.rounds.workflow === workflow
        ? roundFacts(view.rounds.loop, points, run, events, outcomes)
        : null,
    returnCount: points.reduce((sum, point) => sum + returnsIn(outcomes, point).length, 0),
    change:
      view.change !== undefined && view.change.workflow === workflow
        ? changeFacts(view.change.pointer, run, events)
        : null,
  };
}

/** The first line of the declared input, without a leading `#<n> `. */
function itemTitle(view: FactoryView, runs: readonly WorkflowRun[]): string | null {
  if (view.itemTitle === undefined) return null;
  for (const run of [...runs].reverse()) {
    const value = readSubrunMetadata(run.metadata).inputs?.[view.itemTitle.input];
    if (typeof value !== 'string') continue;
    const line = (value.split(/\r?\n/, 1)[0] ?? '').replace(/^#\d+ /, '').trim();
    if (line !== '') return line;
  }
  return null;
}

/** The merge state of a change URL, given the forge audit rows of the run that recorded it. */
export type FactoryChangeState = (
  url: string,
  audits: readonly unknown[]
) => Promise<{ merged: FactoryChangeMerged; mergedAt: string | null }>;

/**
 * An item's progress from its runs (start order) and the facts of each declared run.
 * Runs without facts are not of a declared workflow.
 */
export async function factoryItemProgress(
  view: FactoryView,
  pack: string,
  runs: readonly WorkflowRun[],
  facts: ReadonlyMap<string, FactoryRunFacts>,
  changeState: FactoryChangeState
): Promise<FactoryItemProgress> {
  const declared = [...runs]
    .filter(run => facts.has(run.id))
    .sort((a, b) => a.started_at.getTime() - b.started_at.getTime());
  const latest = <T>(pick: (run: WorkflowRun, fact: FactoryRunFacts) => T | null): T | null => {
    for (const run of [...declared].reverse()) {
      const fact = facts.get(run.id);
      const value = fact === undefined ? null : pick(run, fact);
      if (value !== null) return value;
    }
    return null;
  };
  const running = latest((run, fact) =>
    run.status === 'running'
      ? {
          runId: run.id,
          workflow: declaredWorkflow(view, pack, run.workflow_name) ?? run.workflow_name,
          step: fact.active,
          startedAt: run.started_at.toISOString(),
        }
      : null
  );
  const round = latest((run, fact) => {
    const last = fact.rounds?.rounds.at(-1);
    return fact.rounds && last
      ? {
          runId: run.id,
          iteration: last.iteration,
          max: fact.rounds.max,
          rounds: fact.rounds.rounds,
        }
      : null;
  });
  const found = latest((_run, fact) => fact.change);
  return {
    title: itemTitle(view, runs),
    running,
    round,
    returned: declared.reduce((sum, run) => sum + (facts.get(run.id)?.returnCount ?? 0), 0),
    change:
      found === null ? null : { url: found.url, ...(await changeState(found.url, found.audits)) },
  };
}

/** One of a project's items with its latest activity, as the project listing returns it. */
export interface FactoryListedItem {
  id: string;
  key: string;
  /** ISO time of the item's latest run activity, else when the item was created. */
  activityAt: string;
}

export interface FactoryItemsQuery {
  since?: string;
  limit?: number;
  after?: string;
}

export const FACTORY_ITEMS_DEFAULT_LIMIT = 50;
export const FACTORY_ITEMS_MAX_LIMIT = 100;

const cursorSchema = z.strictObject({
  codebaseId: z.string(),
  since: z.string().datetime().nullable(),
  at: z.string().datetime(),
  id: z.string(),
});
type Cursor = z.infer<typeof cursorSchema>;

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(after: string, codebaseId: string): Cursor {
  let parsed: z.ZodSafeParseResult<Cursor>;
  try {
    parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(after, 'base64url').toString('utf8')));
  } catch {
    throw new FactoryItemsQueryError('after is not a cursor this route returned');
  }
  if (!parsed.success)
    throw new FactoryItemsQueryError('after is not a cursor this route returned');
  if (parsed.data.codebaseId !== codebaseId)
    throw new FactoryItemsQueryError('after is a cursor for another project');
  return parsed.data;
}

function resolveSince(since: string | undefined, now: Date): string | null {
  if (since === undefined) return null;
  try {
    return resolveMetricsWindow({ since }, now).since.toISOString();
  } catch (error) {
    if (error instanceof MetricsQueryError) throw new FactoryItemsQueryError(error.message);
    throw error;
  }
}

/**
 * One page of `listed`, newest activity first, ties by item id. `since` keeps items active
 * at or after it; `after` continues from a cursor `next` returned, which carries its own
 * `since` and refuses one passed beside it.
 */
export function pageFactoryItems(
  listed: readonly FactoryListedItem[],
  query: FactoryItemsQuery,
  codebaseId: string,
  now: Date = new Date()
): { items: FactoryListedItem[]; next: string | null } {
  if (query.after !== undefined && query.since !== undefined)
    throw new FactoryItemsQueryError('after carries its own since; pass one or the other');
  const cursor = query.after === undefined ? null : decodeCursor(query.after, codebaseId);
  const since = cursor === null ? resolveSince(query.since, now) : cursor.since;
  const limit = query.limit ?? FACTORY_ITEMS_DEFAULT_LIMIT;
  const at = (item: FactoryListedItem | Cursor): number =>
    Date.parse('activityAt' in item ? item.activityAt : item.at);
  const ordered = listed
    .filter(item => since === null || at(item) >= Date.parse(since))
    .sort((a, b) => at(b) - at(a) || a.id.localeCompare(b.id))
    .filter(
      item =>
        cursor === null ||
        at(item) < at(cursor) ||
        (at(item) === at(cursor) && item.id.localeCompare(cursor.id) > 0)
    );
  const items = ordered.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    next:
      ordered.length > limit && last !== undefined
        ? encodeCursor({ codebaseId, since, at: last.activityAt, id: last.id })
        : null,
  };
}

/**
 * Facts of runs that ended, kept across page reads so a refetch loads events only for
 * runs still going. Keyed by status and end time too: a failed run can be resumed and end
 * again. Bounded; the oldest entry goes first.
 */
export class FactoryRunFactsMemo {
  private readonly entries = new Map<string, FactoryRunFacts>();
  constructor(private readonly limit = 1000) {}

  private static key(run: WorkflowRun): string | null {
    if (!isTerminalRunStatus(run.status)) return null;
    return `${run.id}|${run.status}|${run.completed_at?.toISOString() ?? ''}`;
  }

  get(run: WorkflowRun): FactoryRunFacts | undefined {
    const key = FactoryRunFactsMemo.key(run);
    return key === null ? undefined : this.entries.get(key);
  }

  set(run: WorkflowRun, facts: FactoryRunFacts): void {
    const key = FactoryRunFactsMemo.key(run);
    if (key === null) return;
    this.entries.set(key, facts);
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.limit) break;
      this.entries.delete(oldest);
    }
  }
}

export interface ReadFactoryItemsPageInput {
  view: FactoryView;
  pack: string;
  projectKey: string;
  codebaseId: string;
  query: FactoryItemsQuery;
  /** The project's items with their latest activity, read only. */
  listProjectItems: (projectKey: string) => Promise<FactoryListedItem[]>;
  changeState: FactoryChangeState;
  memo: FactoryRunFactsMemo;
  /** Called when one item's progress could not be derived; that item gets `progress: null`. */
  onProgressError: (itemId: string, error: unknown) => void;
  now?: Date;
}

type FoundItem = NonNullable<Awaited<ReturnType<typeof readItemRuns>>>;

/** Facts for every declared run of `found`, loading events only for runs not memoised. */
async function runFactsFor(
  source: ItemReadSource,
  input: ReadFactoryItemsPageInput,
  found: readonly FoundItem[]
): Promise<Map<string, FactoryRunFacts>> {
  const { view, pack, memo } = input;
  const facts = new Map<string, FactoryRunFacts>();
  const load: WorkflowRun[] = [];
  for (const run of found.flatMap(item => item.runs)) {
    if (declaredWorkflow(view, pack, run.workflow_name) === null) continue;
    const memoised = memo.get(run);
    if (memoised === undefined) load.push(run);
    else facts.set(run.id, memoised);
  }
  if (load.length === 0) return facts;
  const events = await source.store.listEventsForRuns(
    load.map(run => run.id),
    FACTORY_RUN_FACT_EVENT_TYPES
  );
  for (const run of load) {
    try {
      const fact = factoryRunFacts(view, pack, run, events.get(run.id) ?? []);
      facts.set(run.id, fact);
      memo.set(run, fact);
    } catch (error) {
      // Left out of `facts`; the item reports it through `onProgressError`.
      input.onProgressError(run.item_id ?? run.id, error);
    }
  }
  return facts;
}

/** A page of the project's items, each its `ItemRead` plus `progress`. */
export async function readFactoryItemsPage(
  source: ItemReadSource,
  input: ReadFactoryItemsPageInput
): Promise<FactoryItemsPage> {
  const { pack, projectKey, codebaseId, query } = input;
  const page = pageFactoryItems(
    await input.listProjectItems(projectKey),
    query,
    codebaseId,
    input.now
  );
  if (page.items.length === 0) return { pack, items: [], next: page.next };
  const found: FoundItem[] = [];
  for (const listed of page.items) {
    const item = await readItemRuns(source.store, projectKey, listed.key);
    // An item deleted since the listing is no longer the project's.
    if (item !== null) found.push(item);
  }
  // The one queue reader, read once for the page.
  const queue = splitAttentionRead(await listAttentionQueue(source));
  const facts = await runFactsFor(source, input, found);
  const items = await Promise.all(
    found.map(async (item): Promise<FactoryItem> => {
      const read = await assembleItemRead(source, item, queue);
      return { ...read, progress: await itemProgress(input, item, facts) };
    })
  );
  return { pack, items, next: page.next };
}

async function itemProgress(
  input: ReadFactoryItemsPageInput,
  item: FoundItem,
  facts: ReadonlyMap<string, FactoryRunFacts>
): Promise<FactoryItemProgress | null> {
  const declared = item.runs.filter(
    run => declaredWorkflow(input.view, input.pack, run.workflow_name) !== null
  );
  // A declared run whose facts failed leaves the item's progress unknown, not partial.
  if (declared.some(run => !facts.has(run.id))) return null;
  try {
    return await factoryItemProgress(input.view, input.pack, item.runs, facts, input.changeState);
  } catch (error) {
    input.onProgressError(item.item.id, error);
    return null;
  }
}

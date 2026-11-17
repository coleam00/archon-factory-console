/**
 * What a factory view reads of a project's items beyond the engine's item read (`ItemRead`,
 * as `GET /api/items/window` pages it): each item's progress on the board. Progress is
 * derived from the engine's own records through the view's declaration (`rounds`,
 * `returns`, `change`, `itemTitle`); nothing here stores a position or names a pack's steps.
 *
 * The derivation is pure (`factoryRunFacts`, `factoryItemProgress`); `readFactoryProgress`
 * reads the store once for a set of items and feeds them, and `readFactoryItem` reads one
 * item whole, adding each run's timeline facts (`FactoryItemRun`). Whether a change merged
 * is the caller's lookup (`changeState`), since only the server reaches the forge.
 */
import { z } from 'zod';
import { factoryRunWorkflowName } from './factory-views';
import {
  assembleItemRead,
  itemReadSchema,
  readItemQueue,
  readItemRuns,
  type ItemReadSource,
} from './item-read';
import { resolveJsonPointer } from './json-pointer';
import type { JsonValue } from './output-ref';
import type { FactoryView } from './schemas/factory-view';
import { readSubrunMetadata } from './schemas/run-metadata';
import { startCauseSchema } from './schemas/resource-start';
import { parseRunUsage } from './schemas/run-usage';
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
import { decidedIn, roundFacts, type DecisionPoint } from './factory-rounds';

/**
 * How one round of the declared rounds loop ended, from declared data only: `returned` when
 * a declared return point in the loop sent the item back that round, `approved` when a
 * declared approval point approved it, `undecided` when the round completed with neither
 * (an ask, a replan, or a view that declares no approval: the round's `outcome` says
 * which), `running` while it goes on, `stopped` when the run ended inside it.
 */
export const factoryRoundVerdictSchema = z.enum([
  'approved',
  'returned',
  'undecided',
  'running',
  'stopped',
]);
export type FactoryRoundVerdict = z.infer<typeof factoryRoundVerdictSchema>;

/** Whether the change merged, as the change host reported it; `unknown` when it could not say. */
export const factoryChangeMergedSchema = z.union([z.boolean(), z.literal('unknown')]);
export type FactoryChangeMerged = z.infer<typeof factoryChangeMergedSchema>;

export const factoryItemProgressSchema = z.object({
  /**
   * The declared run input's title line, after any front matter, without a leading `#<n> ` or
   * heading marker; null when no run carries one.
   */
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
        z.object({
          iteration: z.number().int().positive(),
          verdict: factoryRoundVerdictSchema,
          /**
           * The outcome the loop's declared return or approval step recorded that round, as
           * the workflow names it (`return`, `approve`, `ask`...); null when it recorded none.
           */
          outcome: z.string().nullable(),
        })
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
      /** The pull request's number, as the run's forge audit rows name it; null when none does. */
      number: z.number().int().positive().nullable(),
    })
    .nullable(),
  /**
   * The item's runs of declared workflows, in start order, each with the workflow as the
   * view declares it (a run records `owner/name:workflow`). Status, outcome and times are
   * on the item read's `runs`, joined by id.
   */
  runs: z.array(
    z.object({
      runId: z.string(),
      workflow: z.string(),
      /** The first step that failed, as the run's terminal record names it; null when none. */
      failedStep: z.string().nullable(),
    })
  ),
});
export type FactoryItemProgress = z.infer<typeof factoryItemProgressSchema>;

/**
 * One round of the declared rounds loop on one run, with what its steps recorded. `outcome`
 * and `summary` are the declared return or approval step's that decided the round; `steps` are the
 * loop's steps that completed that round with a structured `outcome`, in recording order.
 * `outcome` and `summary` are read by name from a step's structured output, as the workflow
 * names them; a `summary` that is not a string is null.
 */
export const factoryRoundSchema = z.object({
  iteration: z.number().int().positive(),
  verdict: factoryRoundVerdictSchema,
  outcome: z.string().nullable(),
  summary: z.string().nullable(),
  steps: z.array(
    z.object({ node: z.string(), outcome: z.string(), summary: z.string().nullable() })
  ),
});
export type FactoryRound = z.infer<typeof factoryRoundSchema>;

export const factoryItemSchema = itemReadSchema.extend({
  /** Null when this item's progress could not be derived; the rest of the read stands. */
  progress: factoryItemProgressSchema.nullable(),
});
export type FactoryItem = z.infer<typeof factoryItemSchema>;

/** What one run of a declared workflow contributes to its item's progress. */
export interface FactoryRunFacts {
  /** The deepest running step, as of the run's events; null when none runs. */
  active: string | null;
  /** The declared rounds loop's rounds on this run; null when the run is not of that workflow. */
  rounds: {
    max: number | null;
    rounds: FactoryRound[];
  } | null;
  returnCount: number;
  /** The first step that failed, as the run's terminal record names it; null when none did. */
  failedStep: string | null;
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
  const ofWorkflow = (list: readonly DecisionPoint[] | undefined): DecisionPoint[] =>
    (list ?? []).filter(point => point.workflow === workflow);
  const points = { returns: ofWorkflow(view.returns), approves: ofWorkflow(view.approves) };
  const listing = buildNodeOutcomes(run, events);
  const outcomes = listing.nodes;
  return {
    active: deepestActiveStep(events),
    rounds:
      view.rounds !== undefined && view.rounds.workflow === workflow
        ? roundFacts(view.rounds.loop, points, run, events, outcomes)
        : null,
    returnCount: points.returns.reduce((sum, point) => sum + decidedIn(outcomes, point).length, 0),
    failedStep: listing.first_failed_node,
    change:
      view.change !== undefined && view.change.workflow === workflow
        ? changeFacts(view.change.pointer, run, events)
        : null,
  };
}

/** The title of the newest declared run whose declared input has one. */
function itemTitle(view: FactoryView, runs: readonly WorkflowRun[]): string | null {
  if (view.itemTitle === undefined) return null;
  for (const run of [...runs].reverse()) {
    const value = readSubrunMetadata(run.metadata).inputs?.[view.itemTitle.input];
    if (typeof value !== 'string') continue;
    const title = titleOfItemText(value);
    if (title !== null) return title;
  }
  return null;
}

/**
 * An item text's title line: the first non-empty line after any `---` front matter, without a
 * leading `#<n> ` or markdown heading marker. An item an order made opens with front matter
 * (`id`, `source`), then `# Title`; an older item opens with `#<n> Title`. Null when there is
 * no such line, including an unterminated front matter, so the board never shows `---`.
 */
export function titleOfItemText(text: string): string | null {
  let lines = text.split(/\r?\n/);
  if (lines[0]?.trim() === '---') {
    const close = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
    if (close === -1) return null;
    lines = lines.slice(close + 1);
  }
  const line = lines.find(candidate => candidate.trim() !== '');
  if (line === undefined) return null;
  const title = line
    .trim()
    .replace(/^#\d+ /, '')
    .replace(/^#{1,6}(\s+|$)/, '')
    .trim();
  return title === '' ? null : title;
}

/**
 * The merge state and pull request number of a change URL, given the forge audit rows of
 * the run that recorded it and, read only when those name no pull request, the branches
 * the item's declared runs recorded, newest first.
 */
export type FactoryChangeState = (
  url: string,
  audits: readonly unknown[],
  branches: () => Promise<readonly string[]>
) => Promise<{ merged: FactoryChangeMerged; mergedAt: string | null; number: number | null }>;

/**
 * An item's progress from its runs (start order) and the facts of each declared run.
 * Runs without facts are not of a declared workflow.
 */
export async function factoryItemProgress(
  view: FactoryView,
  pack: string,
  runs: readonly WorkflowRun[],
  facts: ReadonlyMap<string, FactoryRunFacts>,
  changeState: FactoryChangeState,
  /** The branch a run recorded; null when it recorded none. */
  branchOf: (run: WorkflowRun) => Promise<string | null>
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
          // The board's contract: each round's verdict and decision, not its steps.
          rounds: fact.rounds.rounds.map(({ iteration, verdict, outcome }) => ({
            iteration,
            verdict,
            outcome,
          })),
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
      found === null
        ? null
        : {
            url: found.url,
            ...(await changeState(found.url, found.audits, () => runBranches(declared, branchOf))),
          },
    runs: declared.map(run => ({
      runId: run.id,
      workflow: declaredWorkflow(view, pack, run.workflow_name) ?? run.workflow_name,
      failedStep: facts.get(run.id)?.failedStep ?? null,
    })),
  };
}

/** The distinct branches `runs` recorded, newest-started first. */
async function runBranches(
  runs: readonly WorkflowRun[],
  branchOf: (run: WorkflowRun) => Promise<string | null>
): Promise<string[]> {
  const branches = await Promise.all([...runs].reverse().map(run => branchOf(run)));
  return [...new Set(branches.filter((branch): branch is string => branch !== null))];
}

/**
 * Facts of runs that ended, kept across reads so a refetch loads events only for
 * runs still going. Keyed by status and end time too, since a failed run can be resumed
 * and end again, and by the declaration parts the facts read, since a view is re-read on
 * every request and may have changed. Bounded; the oldest entry goes first.
 */
export class FactoryRunFactsMemo {
  private readonly entries = new Map<string, FactoryRunFacts>();
  constructor(private readonly limit = 1000) {}

  private static key(view: FactoryView, pack: string, run: WorkflowRun): string | null {
    if (!isTerminalRunStatus(run.status)) return null;
    const read = {
      pack,
      workflows: view.stages.map(stage => stage.workflows),
      rounds: view.rounds,
      returns: view.returns,
      approves: view.approves,
      change: view.change,
    };
    return `${run.id}|${run.status}|${run.completed_at?.toISOString() ?? ''}|${JSON.stringify(read)}`;
  }

  get(view: FactoryView, pack: string, run: WorkflowRun): FactoryRunFacts | undefined {
    const key = FactoryRunFactsMemo.key(view, pack, run);
    return key === null ? undefined : this.entries.get(key);
  }

  set(view: FactoryView, pack: string, run: WorkflowRun, facts: FactoryRunFacts): void {
    const key = FactoryRunFactsMemo.key(view, pack, run);
    if (key === null) return;
    this.entries.set(key, facts);
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.limit) break;
      this.entries.delete(oldest);
    }
  }
}

/** What reading items for a view needs, whether the progress of several or one item whole. */
export interface ReadFactoryItemsInput {
  view: FactoryView;
  pack: string;
  projectKey: string;
  changeState: FactoryChangeState;
  memo: FactoryRunFactsMemo;
  /** Called when one item's progress could not be derived; that item gets `progress: null`. */
  onProgressError: (itemId: string, error: unknown) => void;
}

type FoundItem = NonNullable<Awaited<ReturnType<typeof readItemRuns>>>;

/** Facts for every declared run of `found`, loading events only for runs not memoised. */
async function runFactsFor(
  source: ItemReadSource,
  input: ReadFactoryItemsInput,
  found: readonly FoundItem[]
): Promise<Map<string, FactoryRunFacts>> {
  const { view, pack, memo } = input;
  const facts = new Map<string, FactoryRunFacts>();
  const load: WorkflowRun[] = [];
  for (const run of found.flatMap(item => item.runs)) {
    if (declaredWorkflow(view, pack, run.workflow_name) === null) continue;
    const memoised = memo.get(view, pack, run);
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
      memo.set(view, pack, run, fact);
    } catch (error) {
      // Left out of `facts`; the item reports it through `onProgressError`.
      input.onProgressError(run.item_id ?? run.id, error);
    }
  }
  return facts;
}

/**
 * The factory reads of the items `readItemRuns` found, against one read of the attention
 * queue, with the facts of their declared runs.
 */
async function readFoundItems(
  source: ItemReadSource,
  input: ReadFactoryItemsInput,
  found: readonly FoundItem[]
): Promise<{ items: FactoryItem[]; facts: ReadonlyMap<string, FactoryRunFacts> }> {
  // The one queue reader, read once for all of them.
  const queue = await readItemQueue(source);
  const facts = await runFactsFor(source, input, found);
  const read = await Promise.all(
    found.map(async (item): Promise<FactoryItem | null> => {
      const itemRead = await assembleItemRead(source, item.item, queue);
      // An item gone from the store since it was found is no longer the project's.
      if (itemRead === null) return null;
      return { ...itemRead, progress: await itemProgress(source, input, item, facts) };
    })
  );
  return { items: read.filter((item): item is FactoryItem => item !== null), facts };
}

export const factoryProgressSchema = z.object({
  /** The pack whose view the progress was derived with. */
  pack: z.string(),
  /**
   * Each asked item's progress, by key; null when it could not be derived. A key the
   * project has no item under is left out.
   */
  progress: z.record(z.string(), factoryItemProgressSchema.nullable()),
});
export type FactoryProgress = z.infer<typeof factoryProgressSchema>;

/**
 * The progress of the items `keys` name, reading their runs and the facts of their declared
 * runs once for all of them. The item reads themselves are the engine's window's.
 */
export async function readFactoryProgress(
  source: ItemReadSource,
  input: ReadFactoryItemsInput,
  keys: readonly string[]
): Promise<FactoryProgress> {
  const found: FoundItem[] = [];
  for (const key of new Set(keys)) {
    const item = await readItemRuns(source.store, input.projectKey, key);
    if (item !== null) found.push(item);
  }
  const facts = await runFactsFor(source, input, found);
  // Together: each may wait on the change host for a merge state no request has read yet.
  const read = await Promise.all(
    found.map(
      async item => [item.item.key, await itemProgress(source, input, item, facts)] as const
    )
  );
  return { pack: input.pack, progress: Object.fromEntries(read) };
}

/**
 * What one of an item's runs shows on its timeline beyond the item read's run: the workflow
 * as the view declares it, its cost, its running step, and the declared rounds loop's rounds
 * on it with each round's steps.
 */
export const factoryItemRunSchema = z.object({
  runId: z.string(),
  /** The workflow as the view declares it; null for a run of a workflow the view does not name. */
  workflow: z.string().nullable(),
  /**
   * What started the run, as `item.runs[].cause` reads it; absent for a start by hand. The
   * same value, repeated here because the API's generated types read a nullable union as
   * `unknown`, and an optional one keeps its variants for the console.
   */
  cause: startCauseSchema.optional(),
  /** The run's total cost as it recorded it; null until it records one. */
  costUsd: z.number().nullable(),
  /** The deepest running step while the run runs; null between steps and once it ended. */
  step: z.string().nullable(),
  /** Null when the run is not of the rounds loop's workflow, or its facts could not be read. */
  rounds: z
    .object({
      max: z.number().int().positive().nullable(),
      rounds: z.array(factoryRoundSchema),
    })
    .nullable(),
});
export type FactoryItemRun = z.infer<typeof factoryItemRunSchema>;

export const factoryItemDetailSchema = z.object({
  /** The pack whose view the progress was derived with. */
  pack: z.string(),
  item: factoryItemSchema,
  /** One entry per run in `item.runs`, in the same order. */
  runs: z.array(factoryItemRunSchema),
});
export type FactoryItemDetail = z.infer<typeof factoryItemDetailSchema>;

/** The item `key` names, its read and progress, with each run's timeline facts. */
export async function readFactoryItem(
  source: ItemReadSource,
  input: ReadFactoryItemsInput,
  key: string
): Promise<FactoryItemDetail | null> {
  const found = await readItemRuns(source.store, input.projectKey, key);
  if (found === null) return null;
  const { items, facts } = await readFoundItems(source, input, [found]);
  const [item] = items;
  if (item === undefined) return null;
  const causes = new Map(item.runs.map(run => [run.id, run.cause]));
  const runs = found.runs.map((run): FactoryItemRun => {
    const fact = facts.get(run.id);
    const cause = causes.get(run.id) ?? null;
    return {
      runId: run.id,
      workflow: declaredWorkflow(input.view, input.pack, run.workflow_name),
      ...(cause === null ? {} : { cause }),
      costUsd: parseRunUsage(run.metadata).costUsd ?? null,
      step: run.status === 'running' ? (fact?.active ?? null) : null,
      rounds: fact?.rounds ?? null,
    };
  });
  return { pack: input.pack, item, runs };
}

async function itemProgress(
  source: ItemReadSource,
  input: ReadFactoryItemsInput,
  item: FoundItem,
  facts: ReadonlyMap<string, FactoryRunFacts>
): Promise<FactoryItemProgress | null> {
  const declared = item.runs.filter(
    run => declaredWorkflow(input.view, input.pack, run.workflow_name) !== null
  );
  // A declared run whose facts failed leaves the item's progress unknown, not partial.
  if (declared.some(run => !facts.has(run.id))) return null;
  try {
    return await factoryItemProgress(
      input.view,
      input.pack,
      item.runs,
      facts,
      input.changeState,
      run => source.branchOf(run)
    );
  } catch (error) {
    input.onProgressError(item.item.id, error);
    return null;
  }
}

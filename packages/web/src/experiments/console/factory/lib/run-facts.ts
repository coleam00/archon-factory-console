/**
 * What one run of a workflow the view declares contributes to its item's progress, from the
 * run's record (`GET /api/workflows/runs/records`): its deepest running step, its check rounds,
 * how often it sent the item back, the step it failed at, the change it named, the work order
 * it put the item in, and whether it parked the item or left it waiting on a person. Every
 * name read here (steps, outcomes, pointers into the run's result) comes from the view file;
 * nothing here names a pack's step or reads prose.
 */
import type { RunRecord } from '../api';
import type {
  FactoryAwaits,
  FactoryParked,
  FactoryRound,
  FactoryRoundVerdict,
  RunRounds,
} from './progress-types';
import { valueAt } from './result-pointer';
import { roundsSources } from './step-label';
import type { FactoryViewListed } from './views';

type Declaration = FactoryViewListed['declaration'];
type Outcomes = RunRecord['node_outcomes']['nodes'];
type DecisionPoint = NonNullable<Declaration['returns']>[number];

/** The run as its item read gives it: what a run that ended completed with. */
export interface RunState {
  status: RunRecord['status'];
  outcome: string | null;
}

export interface RunFacts {
  /** The deepest running step; null when none runs. */
  active: string | null;
  rounds: RunRounds | null;
  returnCount: number;
  failedStep: string | null;
  /** The change at the declared pointer; a null `url` is a run that delivered naming none. */
  change: { url: string | null } | null;
  partOf: string | null;
  parked: FactoryParked | null;
  awaits: FactoryAwaits | null;
}

function field(output: unknown, name: string): unknown {
  return typeof output === 'object' && output !== null && name in output
    ? (output as Record<string, unknown>)[name]
    : undefined;
}
const outcomeOf = (output: unknown): unknown => field(output, 'outcome');
function summaryOf(output: unknown): string | null {
  const summary = field(output, 'summary');
  return typeof summary === 'string' ? summary : null;
}

/** The entries in which `point`'s step recorded `point`'s outcome. */
function decidedIn(outcomes: Outcomes, point: DecisionPoint): Outcomes {
  return outcomes.filter(
    entry => entry.node_id === point.node && outcomeOf(entry.output) === point.outcome
  );
}

/** The rounds of `loop` an entry ran in. */
function iterationsIn(entry: Outcomes[number], loop: string): number[] {
  return entry.loop_group_path?.filter(f => f.groupId === loop).map(f => f.iteration) ?? [];
}

/** The trimmed, non-empty string at `pointer` in a completed run's result; else null. */
export function resultString(pointer: string, run: RunState, record: RunRecord): string | null {
  if (run.status !== 'completed') return null;
  const value = valueAt(record, pointer);
  const text = typeof value === 'string' ? value.trim() : '';
  return text === '' ? null : text;
}

/** The deepest running step: most `.`-separated segments, ties to the latest started, then by id. */
function deepestRunning(running: readonly string[]): string | null {
  const depth = (step: string): number => step.split('.').length;
  const order = new Map(running.map((step, index) => [step, index]));
  const [deepest] = [...running].sort(
    (a, b) =>
      depth(b) - depth(a) || (order.get(b) ?? -1) - (order.get(a) ?? -1) || a.localeCompare(b)
  );
  return deepest ?? null;
}

interface Points {
  returns: DecisionPoint[];
  approves: DecisionPoint[];
}

/** Each round's outcome and summary from the loop's declared deciders, the last recorded winning. */
function roundDecisions(loop: string, deciders: readonly DecisionPoint[], outcomes: Outcomes) {
  const nodes = new Set(deciders.map(point => point.node));
  const decided = new Map<number, { outcome: string; summary: string | null }>();
  for (const entry of outcomes) {
    const outcome = outcomeOf(entry.output);
    if (!nodes.has(entry.node_id) || typeof outcome !== 'string') continue;
    for (const iteration of iterationsIn(entry, loop))
      decided.set(iteration, { outcome, summary: summaryOf(entry.output) });
  }
  return decided;
}

/** The loop's steps that recorded a structured outcome in each round, the last per step kept. */
function roundSteps(loop: string, outcomes: Outcomes) {
  const steps = new Map<number, Map<string, FactoryRound['steps'][number]>>();
  for (const entry of outcomes) {
    const outcome = outcomeOf(entry.output);
    if (!entry.node_id.startsWith(`${loop}.`) || typeof outcome !== 'string') continue;
    for (const iteration of iterationsIn(entry, loop)) {
      const round = steps.get(iteration) ?? new Map<string, FactoryRound['steps'][number]>();
      round.set(entry.node_id, { node: entry.node_id, outcome, summary: summaryOf(entry.output) });
      steps.set(iteration, round);
    }
  }
  return steps;
}

const TERMINAL: ReadonlySet<string> = new Set(['completed', 'failed', 'cancelled']);

/** A loop-form source's rounds: the loop's iterations, each decided by its declared points. */
function loopRounds(loop: string, points: Points, run: RunState, record: RunRecord): RunRounds {
  const outcomes = record.node_outcomes.nodes;
  const iterations = record.loop_iterations.filter(entry => entry.group === loop);
  const started = new Map(iterations.map(entry => [entry.iteration, entry.max]));
  const completed = new Set(iterations.filter(e => e.completed).map(e => e.iteration));
  const inLoop = (list: readonly DecisionPoint[]) =>
    list.filter(point => point.node.startsWith(`${loop}.`));
  const roundsDecided = (list: readonly DecisionPoint[]): Set<number> =>
    new Set(
      inLoop(list).flatMap(point =>
        decidedIn(outcomes, point).flatMap(entry => iterationsIn(entry, loop))
      )
    );
  const decided = roundDecisions(loop, inLoop([...points.returns, ...points.approves]), outcomes);
  const steps = roundSteps(loop, outcomes);
  const returnedIn = roundsDecided(points.returns);
  const approvedIn = roundsDecided(points.approves);
  const unfinished = TERMINAL.has(run.status) ? 'stopped' : 'running';
  const verdict = (iteration: number): FactoryRoundVerdict => {
    if (returnedIn.has(iteration)) return 'returned';
    if (approvedIn.has(iteration)) return 'approved';
    // Approved only by a declared approval; one that completed without it needs a decision.
    return completed.has(iteration) ? 'undecided' : unfinished;
  };
  const numbers = [...started.keys()].sort((a, b) => a - b);
  const last = numbers.at(-1);
  return {
    max: (last === undefined ? undefined : started.get(last)) ?? null,
    rounds: numbers.map(iteration => ({
      iteration,
      verdict: verdict(iteration),
      outcome: decided.get(iteration)?.outcome ?? null,
      summary: decided.get(iteration)?.summary ?? null,
      steps: [...(steps.get(iteration)?.values() ?? [])],
    })),
  };
}

/** A positive whole number at `pointer` in the run's result; null otherwise. */
function countAt(record: RunRecord, pointer: string): number | null {
  const found = valueAt(record, pointer);
  return typeof found === 'number' && Number.isInteger(found) && found > 0 ? found : null;
}

type StageSource = { workflow: string; round: string; allowance: string };

/**
 * A stage-form run as its one round, numbered and bounded by its own result: only a run that
 * completed with a result naming a positive whole round is one. Its steps are every step that
 * recorded a structured outcome but the one that returns the result, which restates it.
 */
function stageRound(
  source: StageSource,
  points: Points,
  run: RunState,
  record: RunRecord
): RunRounds | null {
  if (run.status !== 'completed' || record.returns?.availability !== 'available') return null;
  const iteration = countAt(record, source.round);
  if (iteration === null) return null;
  const outcomes = record.node_outcomes.nodes;
  const decides = (list: readonly DecisionPoint[]) =>
    list.some(point => decidedIn(outcomes, point).length > 0);
  const verdict: FactoryRoundVerdict = decides(points.returns)
    ? 'returned'
    : decides(points.approves)
      ? 'approved'
      : 'undecided';
  const deciders = new Set([...points.returns, ...points.approves].map(point => point.node));
  let decided: { outcome: string; summary: string | null } | undefined;
  const steps = new Map<string, FactoryRound['steps'][number]>();
  for (const entry of outcomes) {
    const outcome = outcomeOf(entry.output);
    if (typeof outcome !== 'string') continue;
    const summary = summaryOf(entry.output);
    if (deciders.has(entry.node_id)) decided = { outcome, summary };
    if (entry.node_id !== record.returns.node_id)
      steps.set(entry.node_id, { node: entry.node_id, outcome, summary });
  }
  return {
    max: countAt(record, source.allowance),
    rounds: [
      {
        iteration,
        verdict,
        outcome: decided?.outcome ?? null,
        summary: decided?.summary ?? null,
        steps: [...steps.values()],
      },
    ],
  };
}

/** The view's `parked` or `awaits` entry a completed run takes: `workflow:outcome`, else `workflow:*`. */
function heldEntry<T>(
  entries: Record<string, T> | undefined,
  workflow: string | null,
  run: RunState
): T | undefined {
  if (run.status !== 'completed' || workflow === null || run.outcome === null) return undefined;
  return entries?.[`${workflow}:${run.outcome}`] ?? entries?.[`${workflow}:*`];
}

/** The non-empty trimmed strings of the list at `pointer` in a completed run's result. */
function resultStrings(pointer: string, run: RunState, record: RunRecord): string[] {
  if (run.status !== 'completed') return [];
  const value = valueAt(record, pointer);
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    const text = typeof entry === 'string' ? entry.trim() : '';
    return text === '' ? [] : [text];
  });
}

function runChange(view: Declaration, workflow: string | null, record: RunRecord) {
  const source = [view.change ?? []].flat().find(entry => entry.workflow === workflow);
  if (source === undefined || record.returns?.availability !== 'available') return null;
  const url = valueAt(record, source.pointer);
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  return { url: trimmed === '' ? null : trimmed };
}

/** The facts of one run of `workflow` (as the view names it; null for none it declares). */
export function runFacts(
  view: Declaration,
  workflow: string | null,
  run: RunState,
  record: RunRecord
): RunFacts {
  const ofWorkflow = (list: readonly DecisionPoint[] | undefined) =>
    (list ?? []).filter(point => point.workflow === workflow);
  const points = { returns: ofWorkflow(view.returns), approves: ofWorkflow(view.approves) };
  const outcomes = record.node_outcomes.nodes;
  const source = roundsSources(view).find(entry => entry.workflow === workflow);
  const parked = heldEntry(view.parked, workflow, run);
  const awaits = heldEntry(view.awaits, workflow, run);
  const why = (pointer: string | undefined) =>
    pointer === undefined ? null : resultString(pointer, run, record);
  return {
    active: deepestRunning(record.running),
    rounds:
      source === undefined
        ? null
        : 'loop' in source
          ? loopRounds(source.loop, points, run, record)
          : stageRound(source, points, run, record),
    returnCount: points.returns.reduce((sum, point) => sum + decidedIn(outcomes, point).length, 0),
    failedStep: record.node_outcomes.first_failed_node,
    change: runChange(view, workflow, record),
    partOf:
      view.partOf !== undefined && view.partOf.workflow === workflow
        ? resultString(view.partOf.pointer, run, record)
        : null,
    parked: parked === undefined ? null : { label: parked.label, why: why(parked.why) },
    awaits:
      awaits === undefined
        ? null
        : {
            label: awaits.label,
            why: why(awaits.why),
            questions:
              awaits.questions === undefined ? [] : resultStrings(awaits.questions, run, record),
            next: awaits.next ?? null,
          },
  };
}

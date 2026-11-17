/**
 * The declared rounds loop on one run, from its node outcomes and loop events: each round's
 * verdict through the view's declared returns and approvals, the outcome and summary of the
 * step that decided it, and the loop's steps that recorded an outcome in it. Split from
 * `factory-items.ts`, which owns the shapes these fill.
 */
import { z } from 'zod';
import type { FactoryRound, FactoryRoundVerdict, FactoryRunFacts } from './factory-items';
import type { FactoryView } from './schemas/factory-view';
import { isTerminalRunStatus } from './schemas/run-status';
import type { WorkflowEventRow } from './schemas/workflow-event';
import type { WorkflowRun } from './schemas/workflow-run';
import type { buildNodeOutcomes } from './terminal-record';

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

/** The structured output's `summary` when it is a string; null otherwise. */
function outputSummary(output: unknown): string | null {
  const summary =
    typeof output === 'object' && output !== null && 'summary' in output
      ? output.summary
      : undefined;
  return typeof summary === 'string' ? summary : null;
}

export type Outcomes = ReturnType<typeof buildNodeOutcomes>['nodes'];
/** A declared return or approval: a step, and the outcome it records that decides. */
export type DecisionPoint = NonNullable<FactoryView['returns']>[number];
/** The declared returns and approvals of one workflow. */
export interface DecisionPoints {
  returns: readonly DecisionPoint[];
  approves: readonly DecisionPoint[];
}

/** The entries in which `point`'s step recorded `point`'s outcome. */
export function decidedIn(outcomes: Outcomes, point: DecisionPoint): Outcomes {
  return outcomes.filter(
    entry => entry.node_id === point.node && outputOutcome(entry.output) === point.outcome
  );
}

/** The loop's rounds as its own events record them: each started round's bound, and those that completed. */
function loopRows(
  loop: string,
  events: readonly WorkflowEventRow[]
): { started: Map<number, number | undefined>; completed: Set<number> } {
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
  return { started, completed };
}

/** The rounds of `loop` an entry ran in. */
function iterationsIn(entry: Outcomes[number], loop: string): number[] {
  return entry.loop_group_path?.filter(frame => frame.groupId === loop).map(f => f.iteration) ?? [];
}

/**
 * What the loop's declared return and approval steps decided in each round, with that
 * step's summary. Outcomes are in recording order, so the last one recorded in a round is
 * that round's decision.
 */
function roundDecisions(
  loop: string,
  points: readonly DecisionPoint[],
  outcomes: Outcomes
): Map<number, { outcome: string; summary: string | null }> {
  const nodes = new Set(points.map(point => point.node));
  const decided = new Map<number, { outcome: string; summary: string | null }>();
  for (const entry of outcomes) {
    const outcome = outputOutcome(entry.output);
    if (!nodes.has(entry.node_id) || typeof outcome !== 'string') continue;
    for (const iteration of iterationsIn(entry, loop))
      decided.set(iteration, { outcome, summary: outputSummary(entry.output) });
  }
  return decided;
}

/**
 * The loop's steps that recorded a structured `outcome` in each round, in recording order,
 * the last entry per step and round kept. The loop's own node is not one of its steps.
 */
function roundSteps(
  loop: string,
  outcomes: Outcomes
): Map<number, Map<string, FactoryRound['steps'][number]>> {
  const steps = new Map<number, Map<string, FactoryRound['steps'][number]>>();
  for (const entry of outcomes) {
    const outcome = outputOutcome(entry.output);
    if (!entry.node_id.startsWith(`${loop}.`) || typeof outcome !== 'string') continue;
    for (const iteration of iterationsIn(entry, loop)) {
      const round = steps.get(iteration) ?? new Map<string, FactoryRound['steps'][number]>();
      round.set(entry.node_id, {
        node: entry.node_id,
        outcome,
        summary: outputSummary(entry.output),
      });
      steps.set(iteration, round);
    }
  }
  return steps;
}

export function roundFacts(
  loop: string,
  points: DecisionPoints,
  run: WorkflowRun,
  events: readonly WorkflowEventRow[],
  outcomes: Outcomes
): NonNullable<FactoryRunFacts['rounds']> {
  const { started, completed } = loopRows(loop, events);
  const inLoop = (list: readonly DecisionPoint[]): DecisionPoint[] =>
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
  const unfinished = isTerminalRunStatus(run.status) ? ('stopped' as const) : ('running' as const);
  const verdict = (iteration: number): FactoryRoundVerdict => {
    if (returnedIn.has(iteration)) return 'returned';
    if (approvedIn.has(iteration)) return 'approved';
    // A round is approved only by a declared approval; one that completed without it needs a decision.
    return completed.has(iteration) ? 'undecided' : unfinished;
  };
  const iterations = [...started.keys()].sort((a, b) => a - b);
  const rounds = iterations.map(
    (iteration): FactoryRound => ({
      iteration,
      verdict: verdict(iteration),
      outcome: decided.get(iteration)?.outcome ?? null,
      summary: decided.get(iteration)?.summary ?? null,
      steps: [...(steps.get(iteration)?.values() ?? [])],
    })
  );
  const last = iterations.at(-1);
  return { max: (last === undefined ? undefined : started.get(last)) ?? null, rounds };
}

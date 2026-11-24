/**
 * An item's progress on the board, folded from its runs' facts (`run-facts.ts`) in start order,
 * with its issue's title and its change's merge state as the forge reads answer them. The one
 * place progress is computed: the board, the map, the numbers and the item page all read it.
 */
import type { ItemRead } from '../api';
import type { RunFacts } from './run-facts';
import type { FactoryChange, FactoryItemProgress, FactoryRound } from './progress-types';
import { roundsSources } from './step-label';
import type { FactoryViewListed } from './views';

type ItemRun = ItemRead['runs'][number];
type Declaration = FactoryViewListed['declaration'];

/** The workflow the view names a run of `recorded` (as runs record it) by, a drain too; null when none. */
export function namedWorkflow(view: FactoryViewListed, recorded: string): string | null {
  for (const [workflow, runName] of Object.entries(view.runNames))
    if (runName === recorded) return workflow;
  return null;
}

/** The workflow a stage of the view lists that a run of `recorded` is; null when none does. */
export function declaredWorkflow(view: FactoryViewListed, recorded: string): string | null {
  const workflow = namedWorkflow(view, recorded);
  return workflow !== null && view.declaration.stages.some(s => s.workflows.includes(workflow))
    ? workflow
    : null;
}

/** The item's runs of declared workflows, in start order. */
export function declaredRuns(view: FactoryViewListed, item: ItemRead): ItemRun[] {
  return item.runs
    .filter(run => declaredWorkflow(view, run.workflow) !== null)
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}

/**
 * Which change to ask the forge about: the latest declared run that named a URL, or, when none
 * did, the latest that delivered naming none (its item's run branches are searched). Null when
 * no run delivered.
 */
export type ChangeLookup = { run: string; url: string } | { run: string; url: null } | null;

function latest<T>(
  runs: readonly ItemRun[],
  facts: ReadonlyMap<string, RunFacts>,
  pick: (run: ItemRun, fact: RunFacts) => T | null
): T | null {
  for (const run of [...runs].reverse()) {
    const fact = facts.get(run.id);
    const value = fact === undefined ? null : pick(run, fact);
    if (value !== null) return value;
  }
  return null;
}

export function changeLookup(
  declared: readonly ItemRun[],
  facts: ReadonlyMap<string, RunFacts>
): ChangeLookup {
  const named = latest(declared, facts, (run, fact) =>
    fact.change?.url ? { run: run.id, url: fact.change.url } : null
  );
  if (named !== null) return named;
  return latest(declared, facts, (run, fact) =>
    fact.change !== null ? { run: run.id, url: null } : null
  );
}

/**
 * The item's change: the forge's answer for its lookup, the URL as the run named it. With no
 * answer for a run that named none (its item recorded no branch), or no lookup at all, the
 * merge recorded on the item, if any.
 */
export function changeOf(
  item: ItemRead,
  lookup: ChangeLookup,
  answers: ReadonlyMap<string, FactoryChange>
): FactoryChange | null {
  const answer = lookup === null ? undefined : answers.get(lookup.run);
  if (lookup !== null && lookup.url !== null)
    return { ...(answer ?? { merged: 'pending', mergedAt: null, number: null }), url: lookup.url };
  if (answer !== undefined) return answer;
  return item.merged === null
    ? null
    : { url: item.merged.change, merged: true, mergedAt: item.merged.at, number: null };
}

type BoardRound = NonNullable<FactoryItemProgress['round']>;
const board = (rounds: readonly FactoryRound[]): BoardRound['rounds'] =>
  rounds.map(({ iteration, verdict, outcome }) => ({ iteration, verdict, outcome }));

/**
 * The item's rounds, from the rounds source of the newest declared run that recorded one: the
 * loop on that run, or, for a stage-form source, its runs' rounds newest first, taken while
 * each older round is numbered below the one after it (the rounds since the item was last
 * planned, as the pack numbered them).
 */
function itemRound(
  view: FactoryViewListed,
  declared: readonly ItemRun[],
  facts: ReadonlyMap<string, RunFacts>
): FactoryItemProgress['round'] {
  const newestFirst = [...declared].reverse();
  const workflowOf = (run: ItemRun) => declaredWorkflow(view, run.workflow);
  for (const run of newestFirst) {
    const rounds = facts.get(run.id)?.rounds;
    const last = rounds?.rounds.at(-1);
    if (rounds == null || last === undefined) continue;
    const source = roundsSources(view.declaration).find(s => s.workflow === workflowOf(run));
    if (source === undefined || 'loop' in source)
      return {
        runId: run.id,
        iteration: last.iteration,
        max: rounds.max,
        rounds: board(rounds.rounds),
      };
    const taken: { runId: string; max: number | null; round: FactoryRound }[] = [];
    for (const other of newestFirst.filter(o => workflowOf(o) === workflowOf(run))) {
      const own = facts.get(other.id)?.rounds;
      const round = own?.rounds.at(-1);
      if (own == null || round === undefined) continue;
      const after = taken.at(-1);
      if (after !== undefined && round.iteration >= after.round.iteration) break;
      taken.push({ runId: other.id, max: own.max, round });
    }
    taken.reverse();
    const newest = taken.at(-1);
    if (newest === undefined) return null;
    return {
      runId: newest.runId,
      iteration: newest.round.iteration,
      max: newest.max,
      rounds: board(taken.map(entry => entry.round)),
    };
  }
  return null;
}

/**
 * The work order the newest run of the declared `partOf` workflow that completed with the
 * declared outcome names. Not `latest`: an empty value on the newest such run means the item
 * is in no order now, not that an older run's order still holds.
 */
function workOrderOf(
  view: FactoryViewListed,
  declared: readonly ItemRun[],
  facts: ReadonlyMap<string, RunFacts>
): string | null {
  const partOf: Declaration['partOf'] = view.declaration.partOf;
  if (partOf === undefined) return null;
  const newest = [...declared]
    .reverse()
    .find(
      run =>
        run.status === 'completed' &&
        run.outcome === partOf.outcome &&
        declaredWorkflow(view, run.workflow) === partOf.workflow
    );
  return newest === undefined ? null : (facts.get(newest.id)?.partOf ?? null);
}

/** What the forge answered for an item, joined by the reader. */
export interface ForgeAnswers {
  /** The issue's title; null when its key names no issue or the forge has not named it. */
  title: string | null;
  /** The forge's answer for each delivered change, by the run that delivered it. */
  changes: ReadonlyMap<string, FactoryChange>;
}

/**
 * An item's progress from its declared runs' facts. Null when a declared run has no facts (its
 * record could not be read): the item's progress is then unknown, not partial.
 */
export function itemProgress(
  view: FactoryViewListed,
  item: ItemRead,
  facts: ReadonlyMap<string, RunFacts>,
  forge: ForgeAnswers
): FactoryItemProgress | null {
  const declared = declaredRuns(view, item);
  if (declared.some(run => !facts.has(run.id))) return null;
  const workflowOf = (run: ItemRun) => declaredWorkflow(view, run.workflow) ?? run.workflow;
  const last = declared.at(-1);
  const lastFacts = last === undefined ? undefined : facts.get(last.id);
  return {
    title: forge.title,
    running: latest(declared, facts, (run, fact) =>
      run.status === 'running'
        ? { runId: run.id, workflow: workflowOf(run), step: fact.active, startedAt: run.startedAt }
        : null
    ),
    round: itemRound(view, declared, facts),
    partOf: workOrderOf(view, declared, facts),
    returned: declared.reduce((sum, run) => sum + (facts.get(run.id)?.returnCount ?? 0), 0),
    change: changeOf(item, changeLookup(declared, facts), forge.changes),
    runs: declared.map(run => ({
      runId: run.id,
      workflow: workflowOf(run),
      failedStep: facts.get(run.id)?.failedStep ?? null,
    })),
    // Placement reads the same last run: one started after the parking one takes the item up.
    parked: lastFacts?.parked ?? null,
    awaits: lastFacts?.awaits ?? null,
  };
}

/**
 * What the factory derives of an item beyond Archon's own item read: its progress on the board
 * and, on its page, what each of its runs tells. Derived here, in the web, from Archon's
 * generic reads (`run-facts.ts`, `item-progress.ts`, `run-story.ts`); the engine knows none
 * of these words.
 */
import type { ItemRead } from '../api';

/**
 * How one check round ended: `returned` when a return point the view declares sent the item
 * back that round, `approved` when a declared approval approved it, `undecided` when it
 * completed with neither, `running` while it goes on, `stopped` when the run ended inside it.
 */
export type FactoryRoundVerdict = 'approved' | 'returned' | 'undecided' | 'running' | 'stopped';

/** One check round, with the steps that recorded an outcome in it. */
export interface FactoryRound {
  iteration: number;
  verdict: FactoryRoundVerdict;
  /** The outcome the deciding step recorded, as the workflow names it; null when none did. */
  outcome: string | null;
  summary: string | null;
  steps: { node: string; outcome: string; summary: string | null }[];
}

/** A run's check rounds and the bound its latest round recorded (null when none). */
export interface RunRounds {
  max: number | null;
  rounds: FactoryRound[];
}

/** Whether a change merged: as recorded on the item, else as the forge says, or still asked. */
export type ChangeMergedState = boolean | 'unknown' | 'pending';

export interface FactoryChange {
  /** Null only while the forge has not named the pull request of a run that named no URL. */
  url: string | null;
  merged: ChangeMergedState;
  mergedAt: string | null;
  number: number | null;
}

/** Why an item is held open by its last run, in the view's words and the run's own. */
export interface FactoryParked {
  label: string;
  why: string | null;
}
export interface FactoryAwaits extends FactoryParked {
  questions: string[];
  next: string | null;
}

/** What the board needs of one item beyond its read. */
export interface FactoryItemProgress {
  /** The issue's title as the forge names it; null for a key that names no issue, or until it answers. */
  title: string | null;
  /** The latest-started running run of a declared workflow; null when none runs. */
  running: { runId: string; workflow: string; step: string | null; startedAt: string } | null;
  /** The item's check rounds since it was last planned; null when no run recorded one. */
  round: {
    runId: string;
    iteration: number;
    max: number | null;
    rounds: Pick<FactoryRound, 'iteration' | 'verdict' | 'outcome'>[];
  } | null;
  /** The work order the newest completed run of the view's `partOf` workflow names. */
  partOf: string | null;
  /** How many times a declared return point sent the item back, across all its runs. */
  returned: number;
  change: FactoryChange | null;
  /** The item's runs of declared workflows, in start order. */
  runs: { runId: string; workflow: string; failedStep: string | null }[];
  parked: FactoryParked | null;
  awaits: FactoryAwaits | null;
}

/** One item's read with its progress; null when a run it needs could not be read. */
export type FactoryItem = ItemRead & { progress: FactoryItemProgress | null };

/** What the item page tells of one run. */
export interface FactoryItemRun {
  runId: string;
  /** The workflow as the view names it (a stage's, or its `discoveries` drain); else null. */
  workflow: string | null;
  costUsd: number | null;
  /** The deepest running step while the run runs; else null. */
  step: string | null;
  rounds: RunRounds | null;
  /** The URL the run named at the view's `change` pointer; null when none. */
  change: string | null;
  /** What the run said in its own words, at the view's `story.said` pointers. */
  said: string | null;
  /** The distinct models its completed steps recorded, in first-recorded order. */
  models: string[];
  /** Each step start, in event order, with its ISO time. */
  steps: { node: string; startedAt: string }[];
}

export interface FactoryItemDetail {
  item: FactoryItem;
  /** One entry per run in `item.runs`, in the same order. */
  runs: FactoryItemRun[];
}

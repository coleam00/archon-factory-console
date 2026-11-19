/**
 * Whether an item is parked: kept open for later by an outcome the view file declares
 * `parked`, not ended. Nothing here names a pack's outcome or words; the declaration gives the
 * label and where in the run's result its reason is. Placement still decides where it sits.
 */
import { resolveJsonPointer } from './json-pointer';
import type { JsonValue } from './output-ref';
import type { FactoryView } from './schemas/factory-view';
import type { WorkflowEventRow } from './schemas/workflow-event';
import { displayedRunOutcome, type WorkflowRun } from './schemas/workflow-run';
import { getTerminalRecord } from './terminal-record';

/** The trimmed, non-empty string at `pointer` in a completed run's result; else null. */
export function resultString(
  pointer: string,
  run: WorkflowRun,
  events: readonly WorkflowEventRow[]
): string | null {
  if (run.status !== 'completed') return null;
  const record = getTerminalRecord(run.status, events);
  if (record?.returns.availability !== 'available') return null;
  const value = resolveJsonPointer(record.returns.value as JsonValue, pointer);
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
}

type ParkedEntry = NonNullable<FactoryView['parked']>[string];

/**
 * The `parked` entry a completed run of `workflow` (as the view names it) takes: its exact
 * `workflow:outcome` key, else `workflow:*`. As in `asked`, `*` takes every outcome, not a run
 * that recorded none.
 */
function parkedEntry(
  view: FactoryView,
  workflow: string | null,
  run: WorkflowRun
): ParkedEntry | undefined {
  const outcome = displayedRunOutcome(run);
  if (run.status !== 'completed' || workflow === null || outcome === null) return undefined;
  return view.parked?.[`${workflow}:${outcome}`] ?? view.parked?.[`${workflow}:*`];
}

/**
 * What a run that parked its item says: the declared label, and the reason at the entry's `why`
 * pointer in its result (null when the entry names none or the result has no non-empty string
 * there). Null when the run did not complete with an outcome the view declares `parked`.
 */
export function runParked(
  view: FactoryView,
  workflow: string | null,
  run: WorkflowRun,
  events: readonly WorkflowEventRow[]
): { label: string; why: string | null } | null {
  const entry = parkedEntry(view, workflow, run);
  if (entry === undefined) return null;
  return {
    label: entry.label,
    why: entry.why === undefined ? null : resultString(entry.why, run, events),
  };
}

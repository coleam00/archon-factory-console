/**
 * The change a run names at a declared `change` source's pointer in its result, with the run's
 * forge audit rows. Split from `factory-items.ts`, which owns the shapes it fills and picks the
 * item's change from its runs' (`changeOf`).
 */
import type { FactoryRunFacts } from './factory-items';
import { resolveJsonPointer } from './json-pointer';
import type { JsonValue } from './output-ref';
import { changeSources, type FactoryView } from './schemas/factory-view';
import type { WorkflowEventRow } from './schemas/workflow-event';
import type { WorkflowRun } from './schemas/workflow-run';
import { getTerminalRecord } from './terminal-record';

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
  const trimmed = url.trim();
  return { url: trimmed === '' ? null : trimmed, audits };
}

/** The run's change, at the pointer of the change source naming its workflow; null when none does. */
export function runChange(
  view: FactoryView,
  workflow: string | null,
  run: WorkflowRun,
  events: readonly WorkflowEventRow[]
): FactoryRunFacts['change'] {
  const source = changeSources(view).find(entry => entry.workflow === workflow);
  return source === undefined ? null : changeFacts(source.pointer, run, events);
}

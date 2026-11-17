import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Declaration, FactoryItem } from './board';

/**
 * The declaration this repository ships for the software factory pack. The server validates
 * the file with its zod schema; the type is the generated API type the server's schema owns.
 */
export const softwareFactory = JSON.parse(
  readFileSync(
    join(
      import.meta.dir,
      '../../../../../../../.archon/packs/Wirasm.archon-software-factory.factory-view.json'
    ),
    'utf8'
  )
) as Declaration;

const seeded = (
  JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'map-items.json'), 'utf8')) as {
    items: FactoryItem[];
  }
).items;

/** A real item from the seeded console home, by its key. */
export function realItem(key: string): FactoryItem {
  const item = seeded.find(entry => entry.item.key === key);
  if (item === undefined) throw new Error(`No fixture item ${key}`);
  return structuredClone(item);
}

type Progress = NonNullable<FactoryItem['progress']>;

/** Item 6 (idle after its plan) with its progress replaced by `progress`. */
export function itemWith(key: string, progress: Partial<Progress> | null): FactoryItem {
  const base = realItem('6');
  return {
    ...base,
    item: { ...base.item, id: `item-${key}`, key },
    progress: progress === null ? null : { ...(base.progress as Progress), ...progress },
  };
}

/** A run of a declared workflow working the item now, on `step`. */
export function runningOn(workflow: string, step: string | null): Pick<Progress, 'running'> {
  return {
    running: { runId: `run-${workflow}`, workflow, step, startedAt: '2026-11-17T05:00:00.000Z' },
  };
}

/** The item's last declared run ended with `status` and `outcome`. */
export function endedWith(
  workflow: string,
  status: 'completed' | 'failed' | 'cancelled',
  outcome: string | null
): Pick<Progress, 'running' | 'ended'> {
  return {
    running: null,
    ended: {
      runId: `ended-${workflow}`,
      workflow,
      status,
      outcome,
      completedAt: '2026-11-17T04:00:00.000Z',
    },
  };
}

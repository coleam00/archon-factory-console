/**
 * The board's fixtures: the item page `dev:console` served from a copy of the live factory
 * database (`__fixtures__/items-page.json`), and the declaration this repository ships. Edge
 * cases the copy does not hold (a failed run, an open ask, a triage ending) are made by
 * editing a real item, never from nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FactoryItemsPage } from '../../skills/factory';
import type { FactoryDeclaration, FactoryItem } from './board';

const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

export const PAGE = read(
  join(import.meta.dir, '__fixtures__', 'items-page.json')
) as FactoryItemsPage;

export const VIEW = read(
  join(
    import.meta.dir,
    ...Array<string>(7).fill('..'),
    '.archon',
    'packs',
    'Wirasm.archon-software-factory.factory-view.json'
  )
) as FactoryDeclaration;

/** A real item by key, deep-copied so a test can edit it. */
export function realItem(key: string): FactoryItem {
  const found = PAGE.items.find(entry => entry.item.key === key);
  if (found === undefined) throw new Error(`the fixture page has no item ${key}`);
  return structuredClone(found);
}

/** The item's progress, which every real item has. */
export function progressOf(item: FactoryItem): NonNullable<FactoryItem['progress']> {
  if (item.progress === null) throw new Error(`item ${item.item.key} has no progress`);
  return item.progress;
}

/** Keep only the item's first `count` runs, in the read and in its progress. */
export function keepRuns(item: FactoryItem, count: number): FactoryItem {
  const progress = progressOf(item);
  return {
    ...item,
    runs: item.runs.slice(0, count),
    progress: { ...progress, runs: progress.runs.slice(0, count), running: null },
  };
}

/** Change the last run's status, outcome and failed step, in the read and in its progress. */
export function endLastRun(
  item: FactoryItem,
  status: FactoryItem['runs'][number]['status'],
  outcome: string | null,
  failedStep: string | null = null
): FactoryItem {
  const progress = progressOf(item);
  const runs = [...item.runs];
  const last = runs.at(-1);
  if (last === undefined) throw new Error('the item has no runs');
  runs[runs.length - 1] = { ...last, status, outcome };
  return {
    ...item,
    runs,
    progress: {
      ...progress,
      running: null,
      runs: progress.runs.map(run => (run.runId === last.id ? { ...run, failedStep } : run)),
    },
  };
}

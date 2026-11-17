/**
 * The Overview's numbers strip (DESIGN.md, "Overview page"), from the board's model. Each
 * count is the number of cards the board shows under that number's filter.
 */
import { ensureUtc } from '../../lib/format';
import { filterBoard, type BoardModel, type PlacedCard } from './board';
import type { BoardShow } from './board-show';

export interface FactoryNumbers {
  inFlight: number;
  needsYou: number;
  landedToday: number;
  /** N of "N of M done". */
  landed: number;
  /** M of "N of M done": every item on the board; items an ending took off it are not. */
  total: number;
  /** Median from an item's first declared run to its change merging; null when none landed. */
  medianToLandMs: number | null;
}

const cardCount = (model: BoardModel): number =>
  model.columns.reduce((sum, column) => sum + column.cards.length, 0);

const ms = (iso: string): number => new Date(ensureUtc(iso)).getTime();

/**
 * From the item's first declared run starting to its change merging; null for an item that
 * has not merged, has no merge time, or has no declared run the read carries.
 */
function timeToLand({ item }: PlacedCard): number | null {
  const mergedAt = item.progress?.change?.mergedAt ?? null;
  if (mergedAt === null) return null;
  const declared = new Set(item.progress?.runs.map(run => run.runId));
  const starts = item.runs.filter(run => declared.has(run.id)).map(run => ms(run.startedAt));
  if (starts.length === 0) return null;
  return ms(mergedAt) - Math.min(...starts);
}

/** The median of `values`; the mean of the two middle ones for an even count. */
export function median(values: readonly number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return null;
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] ?? 0) + upper) / 2;
}

export function factoryNumbers(model: BoardModel, now: Date): FactoryNumbers {
  const shown = (show: BoardShow): BoardModel => filterBoard(model, '', show, now);
  const landed = shown('landed');
  const times = landed.columns
    .flatMap(column => column.cards)
    .flatMap(placed => timeToLand(placed) ?? []);
  return {
    inFlight: cardCount(shown('in-flight')),
    needsYou: cardCount(shown('needs-you')),
    landedToday: cardCount(shown('landed-today')),
    landed: cardCount(landed),
    total: cardCount(model),
    medianToLandMs: median(times),
  };
}

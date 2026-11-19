/** The board's Table view: one row per item with the card's fields, sortable by any of them. */
import { ensureUtc } from '../../lib/format';
import { PILL_LABEL, type BoardModel, type Pill, type PlacedCard } from './board';

export const TABLE_COLUMNS = [
  { id: 'key', label: 'Item' },
  { id: 'title', label: 'Title' },
  { id: 'order', label: 'Work order' },
  { id: 'column', label: 'Column' },
  { id: 'stage', label: 'Stage' },
  { id: 'state', label: 'State' },
  { id: 'round', label: 'Round' },
  { id: 'returned', label: 'Returned' },
  { id: 'change', label: 'Change' },
  { id: 'merged', label: 'Merged' },
  { id: 'stop', label: 'Stopped by or asks' },
] as const;
export type TableColumnId = (typeof TABLE_COLUMNS)[number]['id'];

export interface TableRow {
  placed: PlacedCard;
  /** The column's label, or the ending's for an item the board folded away. */
  column: string;
  /** Left to right on the board; folded items after every column. */
  columnOrder: number;
  /** The label of the stage it sits in; null for a folded item, which is in none. */
  stage: string | null;
  /** The stage's place on the board: columns left to right, then stages within one. */
  stageOrder: number;
}

export interface TableSort {
  by: TableColumnId;
  descending: boolean;
}

/** Every row the board shows, columns first in board order, then the folded endings. */
export function tableRows(model: BoardModel): TableRow[] {
  const stages = model.columns.flatMap(column => column.stages);
  const placed = model.columns.flatMap((column, order) =>
    column.cards.map(card => {
      const stage = card.column !== null && 'stage' in card.column ? card.column.stage : null;
      return {
        placed: card,
        column: column.label,
        columnOrder: order,
        stage: stage?.label ?? null,
        stageOrder: stage === null ? stages.length : stages.indexOf(stage.id),
      };
    })
  );
  const ended = model.ended.flatMap(group =>
    group.cards.map(card => ({
      placed: card,
      column: group.label,
      columnOrder: model.columns.length,
      stage: null,
      stageOrder: stages.length,
    }))
  );
  return [...placed, ...ended];
}

const PILL_ORDER: readonly Pill[] = Object.keys(PILL_LABEL) as Pill[];
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** What a row sorts by in one column: a number, or text compared numerically-aware. */
function sortValue(row: TableRow, by: TableColumnId): number | string {
  const { card, item } = row.placed;
  switch (by) {
    case 'key':
      return card.key;
    case 'title':
      return card.title;
    case 'column':
      return row.columnOrder;
    case 'stage':
      return row.stageOrder;
    case 'state':
      return PILL_ORDER.indexOf(card.pill);
    case 'round':
      return item.progress?.round?.iteration ?? 0;
    case 'returned':
      return card.returned?.count ?? 0;
    case 'change':
      return item.progress?.change?.number ?? 0;
    case 'merged':
      // ISO times sort as text; only a merged card shows one.
      return card.mergedAt === null ? '' : (item.progress?.change?.mergedAt ?? '');
    case 'stop':
      return card.stopLine ?? '';
    case 'order':
      return card.order ?? '';
  }
}

/** The rows sorted by one column; ties keep board order. */
export function sortRows(rows: readonly TableRow[], sort: TableSort): TableRow[] {
  const sign = sort.descending ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = sortValue(a, sort.by);
    const right = sortValue(b, sort.by);
    const order =
      typeof left === 'number' && typeof right === 'number'
        ? left - right
        : collator.compare(String(left), String(right));
    return sign * order;
  });
}

/** A time in the Table's Merged cell: month, day, hour and minute, local ("Nov 17, 14:05"). */
export function shortDateTime(iso: string): string {
  return new Date(ensureUtc(iso)).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

/**
 * What each number of the Overview's strip counts, as a board filter (`?show=`): the strip
 * counts the cards the board shows under the same filter, so a number and the board it
 * links to cannot disagree.
 */
import { ensureUtc } from '../../lib/format';
import type { PlacedCard } from './board';

/** `?view=table` shows the board's Table view; Pipeline is the default. */
export const VIEW_PARAM = 'view';
export const TABLE_VIEW = 'table';
/** `?show=` narrows the board to what one of the Overview's numbers counts. */
export const SHOW_PARAM = 'show';

export const BOARD_SHOWS = ['in-flight', 'needs-you', 'landed-today', 'landed'] as const;
export type BoardShow = (typeof BOARD_SHOWS)[number];

/** The filter's name in plain words, as the board's chip says it. */
export const BOARD_SHOW_LABEL: Record<BoardShow, string> = {
  'in-flight': 'in flight',
  'needs-you': 'needs you',
  'landed-today': 'merged today',
  landed: 'merged',
};

/** The `?show=` value as a filter; undefined for one no filter has. */
export function parseBoardShow(value: string): BoardShow | undefined {
  return BOARD_SHOWS.find(show => show === value);
}

/** Whether `iso` falls on the same local calendar day as `now`. */
function sameLocalDay(iso: string, now: Date): boolean {
  const at = new Date(ensureUtc(iso));
  return (
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate()
  );
}

/**
 * Whether the filter `show` keeps `placed`. In flight: on the board, outside the landed
 * stage, and not parked (open, but nothing works it until someone takes it up). Needs you: its pill says so. Landed: in the landed stage. Landed today: landed,
 * its change merged on `now`'s local day. An item an ending took off the board, or one
 * placement found no column for, is none.
 */
export function showsCard(
  show: BoardShow,
  placed: PlacedCard,
  landedStage: string,
  now: Date
): boolean {
  const { column, card, item } = placed;
  if (column === null || 'ended' in column) return false;
  const landed = column.stage.id === landedStage;
  switch (show) {
    case 'in-flight':
      return !landed && card.pill !== 'parked';
    case 'needs-you':
      return card.pill === 'needs-you';
    case 'landed':
      return landed;
    case 'landed-today': {
      const mergedAt = item.progress?.change?.mergedAt ?? null;
      return landed && mergedAt !== null && sameLocalDay(mergedAt, now);
    }
  }
}

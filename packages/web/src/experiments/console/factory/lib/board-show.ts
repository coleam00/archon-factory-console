/**
 * What each number of the Overview's strip counts, as a board filter (`?show=`): the strip
 * counts the cards the board shows under the same filter, so a number and the board it
 * links to cannot disagree.
 */
import { ensureUtc } from '../../lib/format';
import type { PlacedCard } from './board';

export const BOARD_SHOWS = ['in-flight', 'needs-you', 'landed-today', 'landed'] as const;
export type BoardShow = (typeof BOARD_SHOWS)[number];

/** The filter's name in plain words, as the board's chip says it. */
export const BOARD_SHOW_LABEL: Record<BoardShow, string> = {
  'in-flight': 'in flight',
  'needs-you': 'needs you',
  'landed-today': 'landed today',
  landed: 'landed',
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
 * column. Needs you: its pill says so. Landed: in the landed column. Landed today: landed,
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
      return !landed;
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

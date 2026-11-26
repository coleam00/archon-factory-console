/**
 * The map's columns in their colours. A column is a group, or one stage in none
 * (`curated-view.ts`). The pack names no colours: the group columns take the console's stage
 * colours in order (taking work in, building, checking, merging), the column the board's Merged
 * column is counted on takes the merged colour, and a group past the fourth, or a stage in no
 * group, is `other`: a card's colour and kind label belong to its group, so a lone stage never
 * reads as a group it is not in.
 */
import type { CuratedColumn, CuratedView } from './curated-view';

const STAGE_TONES = ['intake', 'build', 'check', 'land'] as const;
/** A column's colour: a stage colour by group position, the merged column's own, or `other`. */
export type ColumnTone = (typeof STAGE_TONES)[number] | 'merged' | 'other';

export interface MapColumn extends CuratedColumn {
  tone: ColumnTone;
}

export function mapColumns(view: Pick<CuratedView, 'columns' | 'landed'>): MapColumn[] {
  let position = 0;
  return view.columns.map(column => {
    if (column.stages.includes(view.landed.stage)) return { ...column, tone: 'merged' };
    if (!column.grouped) return { ...column, tone: 'other' };
    const tone = STAGE_TONES[position] ?? 'other';
    position += 1;
    return { ...column, tone };
  });
}

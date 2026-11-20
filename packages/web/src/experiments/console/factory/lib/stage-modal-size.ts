import type { FactoryDrilldown } from './drilldown-live';
import type { StageTab } from './views';

/*
 * Every length the stage modal's size rule depends on, owned here and read by the layout that
 * draws it (StageDrilldown's phase grid, the modal's padding), so the rule and what renders
 * cannot drift. In rem. A loop frame is a subgrid inside its phases' tracks, so it adds no width.
 */

/** A phase column's widest, so a one-phase stage does not stretch a card across the page. */
export const PHASE_COLUMN_REM = 20;
/** The gap between phase columns. */
export const PHASE_GAP_REM = 1;
/** The modal body's padding from md up, on every side but the close button's. */
export const MODAL_PAD_REM = 1.5;
/** The modal body's right padding from md up, the room the close button sits in. */
export const MODAL_CLOSE_GUTTER_REM = 4;
/** The narrowest the modal opens, so one card reads as a compact panel, not a sliver. */
export const MODAL_MIN_REM = 40;
/** The share of the window the modal may take at most, in each direction. */
export const MODAL_CAP = 0.9;

export interface StageModalSize {
  /** The panel's width in px. */
  width: number;
  /** The panel's height in px, or undefined to let it take its content's (before a measure). */
  height: number | undefined;
}

/**
 * The stage modal's size from md up, each way at most `MODAL_CAP` of the window and at least
 * `MODAL_MIN_REM` wide. "What this stage does" and "Items here now" are as wide as the
 * drill-down's phases, so moving between them does not resize the panel. "The real workflow"
 * is as wide as the widest graph it draws (`graphWidth`, its canvas included); until a graph is
 * drawn, or when the stage has none, it keeps the phases' width. The height is the content's:
 * `naturalHeight`, the panel's height with its whole body showing, which only the browser can
 * measure.
 */
export function stageModalSize({
  drilldown,
  tab,
  graphWidth,
  naturalHeight,
  viewport,
  scrollbarPx = 0,
  remPx = 16,
}: {
  drilldown: FactoryDrilldown | undefined;
  tab: StageTab;
  /** The widest drawn graph's width in px, canvas included; undefined while none is drawn. */
  graphWidth: number | undefined;
  naturalHeight: number | undefined;
  viewport: { width: number; height: number };
  /** The width the body's scroller keeps for its scrollbar; 0 where scrollbars overlay. */
  scrollbarPx?: number;
  remPx?: number;
}): StageModalSize {
  const capWidth = Math.floor(viewport.width * MODAL_CAP);
  const capHeight = Math.floor(viewport.height * MODAL_CAP);
  const chromeRem = MODAL_PAD_REM + MODAL_CLOSE_GUTTER_REM;
  const phases = drilldown?.phases.length ?? 0;
  const phasesRem = phases === 0 ? 0 : phases * PHASE_COLUMN_REM + (phases - 1) * PHASE_GAP_REM;
  const contentPx = tab === 'workflow' && graphWidth !== undefined ? graphWidth : phasesRem * remPx;
  const width = Math.min(
    capWidth,
    Math.max(MODAL_MIN_REM * remPx, contentPx + scrollbarPx + chromeRem * remPx)
  );
  return {
    width: Math.ceil(width),
    height: naturalHeight === undefined ? undefined : Math.min(Math.ceil(naturalHeight), capHeight),
  };
}

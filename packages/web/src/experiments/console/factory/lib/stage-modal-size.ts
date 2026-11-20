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
 * The stage modal's size from md up: as wide as its drill-down's phases (at least
 * `MODAL_MIN_REM`), "The real workflow" as wide as the cap, as tall as its content, and each
 * at most `MODAL_CAP` of the window. "Items here now" takes the phases' width too, so moving
 * between the summary and the items does not resize the panel. `naturalHeight` is the panel's
 * height with its whole body showing, which only the browser can measure.
 */
export function stageModalSize({
  drilldown,
  tab,
  naturalHeight,
  viewport,
  remPx = 16,
}: {
  drilldown: FactoryDrilldown | undefined;
  tab: StageTab;
  naturalHeight: number | undefined;
  viewport: { width: number; height: number };
  remPx?: number;
}): StageModalSize {
  const capWidth = Math.floor(viewport.width * MODAL_CAP);
  const capHeight = Math.floor(viewport.height * MODAL_CAP);
  const phases = drilldown?.phases.length ?? 0;
  const phasesRem = phases === 0 ? 0 : phases * PHASE_COLUMN_REM + (phases - 1) * PHASE_GAP_REM;
  const panelRem = phasesRem + MODAL_PAD_REM + MODAL_CLOSE_GUTTER_REM;
  const width =
    tab === 'workflow' ? capWidth : Math.min(capWidth, Math.max(MODAL_MIN_REM, panelRem) * remPx);
  return {
    width,
    height: naturalHeight === undefined ? undefined : Math.min(Math.ceil(naturalHeight), capHeight),
  };
}

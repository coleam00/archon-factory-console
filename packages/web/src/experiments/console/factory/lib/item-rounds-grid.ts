/**
 * The check rounds of one Checks panel as a grid (DESIGN.md, The item page): rows are the
 * checks, columns the rounds, each cell an icon and a word. A loop-form delivery records its
 * rounds inside one run; a stage-form one records each round as its own run. Both arrive as
 * `rounds` on the item read's runs (the server normalises them), so the grid reads one shape.
 * Rows come from declared data only: a step with a declared meaning (`returns`, `approves`,
 * `verdicts`), the builder's fixes between rounds, the stage that read CI and the reviews after
 * the last round, and the shadow steps' decisions (rule 10). Nothing here names a pack's step.
 */
import type { FactoryItemDetail } from '../../skills/factory';
import { shadowOf, shadowWords } from './shadows';
import { stageOfStep, stageOfWorkflow } from './placement';
import { stepLabel } from './step-label';
import type { RunKind, TimelineRow } from './timeline';
import type { RunFacts, StoryVisit } from './item-visits';
import type { FactoryViewListed } from './views';

type Declaration = FactoryViewListed['declaration'];
type Round = NonNullable<RunFacts['rounds']>['rounds'][number];
type RoundStep = Round['steps'][number];
type Meaning = NonNullable<Declaration['verdicts']>[string][string][string];

/**
 * What a cell says. `approved`, `returned`, `asked`: a check's declared meaning. `fixed`: the
 * builder fixed what the round sent back. `failed`, `running`: a run that did not finish.
 * `token`: an outcome the view does not word (the pack's token, in mono). `shadow`: what a
 * shadow step would have done, never a state colour.
 */
export type CellMeaning =
  | 'approved'
  | 'returned'
  | 'asked'
  | 'fixed'
  | 'failed'
  | 'running'
  | 'token'
  | 'shadow';

export interface GridCell {
  meaning: CellMeaning;
  text: string;
  /** The hover: the step's engine id and what it said. */
  title: string | null;
}

export interface GridColumn {
  /**
   * The round's place among the item's rounds since it was last planned (1, 2, 3...), the
   * number a person reads. Never the number a run recorded: a stage-form run's `/round` can
   * repeat one (two runs that both recorded round 1), so the grid counts them itself.
   */
  number: number;
  /** The round as the run recorded it: a loop's iteration, or a stage-form run's `/round`. */
  iteration: number;
  /** The allowance the round's run recorded; null when it recorded none. */
  max: number | null;
  verdict: Round['verdict'];
  runId: string;
  /** What the deciding step said, on a round that sent the change back. */
  reason: string | null;
}

export interface GridRow {
  key: string;
  label: string;
  shadow: boolean;
  /** One list per column, stacked in order; an empty list reads "Not run". */
  cells: GridCell[][];
}

export interface RoundsGrid {
  columns: GridColumn[];
  rows: GridRow[];
}

/** Each declared meaning's word in a cell. */
export const MEANING_WORD: Record<'approved' | 'returned' | 'asked' | 'fixed', string> = {
  approved: 'Approved',
  returned: 'Sent back',
  asked: 'Asked you',
  fixed: 'Fixed',
};

const MEANING_CELL: Record<Meaning, CellMeaning> = {
  approved: 'approved',
  returned: 'returned',
  asked: 'asked',
};

/**
 * A step's outcome as the view declares it: `returned` or `approved` where `returns` or
 * `approves` names that step and outcome, its `verdicts` meaning where one is given, else null.
 */
export function stepMeaning(view: Declaration, workflow: string, step: RoundStep): Meaning | null {
  const declares = (points: Declaration['returns']): boolean =>
    (points ?? []).some(
      point =>
        point.workflow === workflow && point.node === step.node && point.outcome === step.outcome
    );
  if (declares(view.returns)) return 'returned';
  if (declares(view.approves)) return 'approved';
  return view.verdicts?.[workflow]?.[step.node]?.[step.outcome] ?? null;
}

/** Whether the view gives `node` of `workflow` any meaning, so the grid gives it a row. */
function declaredStep(view: Declaration, workflow: string, node: string): boolean {
  const named = (points: Declaration['returns']): boolean =>
    (points ?? []).some(point => point.workflow === workflow && point.node === node);
  return (
    named(view.returns) || named(view.approves) || view.verdicts?.[workflow]?.[node] !== undefined
  );
}

function stepCell(view: Declaration, workflow: string, step: RoundStep): GridCell {
  const meaning = stepMeaning(view, workflow, step);
  const title = [step.node, step.summary].filter(Boolean).join('\n');
  return meaning === null
    ? { meaning: 'token', text: step.outcome, title }
    : { meaning: MEANING_CELL[meaning], text: MEANING_WORD[meaning], title };
}

/** A whole run's outcome as one cell: the fix row and the CI row. */
const KIND_CELL: Partial<Record<RunKind, Omit<GridCell, 'title'>>> = {
  'sent-on': { meaning: 'approved', text: MEANING_WORD.approved },
  returned: { meaning: 'returned', text: MEANING_WORD.returned },
  asked: { meaning: 'asked', text: MEANING_WORD.asked },
  failed: { meaning: 'failed', text: 'Failed' },
  running: { meaning: 'running', text: 'Running' },
};

const fixCell = (row: TimelineRow | undefined): GridCell => {
  if (row === undefined || row.kind === 'sent-on' || row.kind === 'other')
    return { meaning: 'fixed', text: MEANING_WORD.fixed, title: null };
  const cell = KIND_CELL[row.kind];
  return cell === undefined
    ? { meaning: 'token', text: row.outcome.text, title: null }
    : { ...cell, title: null };
};

interface GridContext {
  view: Declaration;
  facts: ReadonlyMap<string, RunFacts>;
  rows: ReadonlyMap<string, TimelineRow>;
  order: ReadonlyMap<string, number>;
  /** Each round's number on the item (`roundNumbers`), by `roundKey`. */
  numbers: ReadonlyMap<string, number>;
}

const roundKey = (runId: string, iteration: number): string => `${runId}|${iteration.toString()}`;

/**
 * Each check round's number on the item: its place, in run order, among the rounds since the
 * item was last planned. A run on an intake-group stage (the item taken in, judged or planned
 * again) starts the count over; a fix's own steps are no round. Both delivery shapes count
 * alike: a loop's iterations in order, and one round per stage-form run.
 */
function roundNumbers(view: Declaration, detail: FactoryItemDetail): Map<string, number> {
  const numbers = new Map<string, number>();
  const facts = new Map(detail.runs.map(run => [run.runId, run]));
  let count = 0;
  for (const run of detail.item.runs) {
    const fact = facts.get(run.id);
    const workflow = fact?.workflow ?? null;
    if (workflow === null) continue;
    if (stageOfWorkflow(view, workflow, null)?.group === 'intake') count = 0;
    for (const round of fact?.rounds?.rounds ?? [])
      numbers.set(roundKey(run.id, round.iteration), ++count);
  }
  return numbers;
}

/** The rounds the panel's own runs recorded on the panel's stage, in order. */
function gridColumns(
  ctx: GridContext,
  panel: StoryVisit
): { column: GridColumn; round: Round; workflow: string }[] {
  return panel.runIds.flatMap(runId => {
    const fact = ctx.facts.get(runId);
    const workflow = fact?.workflow;
    if (fact?.rounds == null || workflow == null) return [];
    const { max } = fact.rounds;
    return fact.rounds.rounds
      .filter(round => roundStage(ctx.view, workflow, round) === panel.stage.id)
      .map(round => ({
        column: {
          number: ctx.numbers.get(roundKey(runId, round.iteration)) ?? round.iteration,
          iteration: round.iteration,
          max,
          verdict: round.verdict,
          runId,
          reason: round.verdict === 'returned' ? round.summary : null,
        },
        round,
        workflow,
      }));
  });
}

/** The stage a round's checks are on: its first step's that a stage names, else its workflow's. */
function roundStage(view: Declaration, workflow: string, round: Round): string | undefined {
  for (const step of round.steps) {
    const stage = stageOfStep(view, workflow, step.node);
    if (stage !== undefined && stage.group !== 'build') return stage.id;
  }
  return stageOfWorkflow(view, workflow, null)?.id;
}

/** A row by label, created in first-seen order. */
function rowOf(
  rows: GridRow[],
  key: string,
  label: string,
  width: number,
  shadow = false
): GridRow {
  const found = rows.find(row => row.key === key);
  if (found !== undefined) return found;
  const row: GridRow = { key, label, shadow, cells: Array.from({ length: width }, () => []) };
  rows.push(row);
  return row;
}

/**
 * The checks' rows: each declared step, named by `stepLabel` (so a loop's and a stage's review
 * share one row), in the order the view names the workflow's steps; a step a build stage names
 * inside the loop (its fix) goes to the fix row, in the column of the round it answered.
 */
function checkRows(
  ctx: GridContext,
  columns: ReturnType<typeof gridColumns>
): { checks: GridRow[]; fixes: GridRow | null } {
  const checks: GridRow[] = [];
  let fixes: GridRow | null = null;
  const width = columns.length;
  columns.forEach(({ round, workflow }, index) => {
    for (const step of round.steps) {
      const stage = stageOfStep(ctx.view, workflow, step.node);
      if (stage?.group === 'build') {
        fixes ??= rowOf([], 'fix', stage.label, width);
        fixes.cells[Math.max(0, index - 1)]?.push({ ...fixCell(undefined), title: step.node });
        continue;
      }
      if (!declaredStep(ctx.view, workflow, step.node)) continue;
      const label = stepLabel(ctx.view, workflow, step.node);
      rowOf(checks, label, label, width).cells[index]?.push(stepCell(ctx.view, workflow, step));
    }
  });
  const rank = (row: GridRow): number => {
    const workflow = columns[0]?.workflow ?? '';
    const names = Object.values(ctx.view.steps?.[workflow] ?? {});
    const at = names.indexOf(row.label);
    return at === -1 ? names.length : at;
  };
  return { checks: checks.sort((a, b) => rank(a) - rank(b)), fixes };
}

/** The builder's fix runs folded into the panel, each in the column of the round it answered. */
function addFixRuns(
  ctx: GridContext,
  panel: StoryVisit,
  columns: ReturnType<typeof gridColumns>,
  rows: GridRow[],
  existing: GridRow | null
): GridRow | null {
  let fixes = existing;
  for (const runId of panel.fixRunIds) {
    if (columns.some(entry => entry.column.runId === runId)) continue;
    const at = ctx.order.get(runId) ?? 0;
    const index = columns.filter(entry => (ctx.order.get(entry.column.runId) ?? 0) < at).length - 1;
    const stage = stageOfWorkflow(ctx.view, ctx.facts.get(runId)?.workflow ?? '', null);
    fixes ??= rowOf(rows, 'fix', stage?.label ?? 'Fix', columns.length);
    fixes.cells[Math.max(0, index)]?.push(fixCell(ctx.rows.get(runId)));
  }
  return fixes;
}

/** What the check stage after the panel did with the change: one cell per run, in the last round. */
function nextStageRow(
  ctx: GridContext,
  next: StoryVisit | undefined,
  width: number
): GridRow | null {
  if (next === undefined || next.stage.group !== 'check' || width === 0) return null;
  const row = rowOf([], `next:${next.stage.id}`, next.stage.label, width);
  for (const runId of next.runIds) {
    const timeline = ctx.rows.get(runId);
    const cell = timeline === undefined ? undefined : KIND_CELL[timeline.kind];
    row.cells[width - 1]?.push(
      cell === undefined
        ? { meaning: 'token', text: timeline?.outcome.text ?? '', title: null }
        : { ...cell, title: null }
    );
  }
  return row;
}

/** What the shadow steps decided in each round: a row per shadow label, never a state colour. */
function shadowRows(ctx: GridContext, columns: ReturnType<typeof gridColumns>): GridRow[] {
  const rows: GridRow[] = [];
  columns.forEach(({ column }, index) => {
    for (const decision of ctx.facts.get(column.runId)?.shadows ?? []) {
      if (decision.round !== null && decision.round !== column.iteration) continue;
      const shadow = shadowOf(ctx.view, decision.workflow, decision.node);
      const label = shadow?.label ?? decision.node;
      const words = shadowWords(shadow, decision);
      rowOf(rows, `shadow:${label}`, label, columns.length, true).cells[index]?.push({
        meaning: 'shadow',
        text: words.line,
        title: words.detail,
      });
    }
  });
  return rows;
}

/** The shadow decisions the grid shows, as `runId|node|round` keys, so the panel lists the rest. */
export function gridShadowKeys(grid: RoundsGrid | null, facts: ReadonlyMap<string, RunFacts>) {
  const keys = new Set<string>();
  for (const column of grid?.columns ?? [])
    for (const decision of facts.get(column.runId)?.shadows ?? [])
      if (decision.round === null || decision.round === column.iteration)
        keys.add(`${decision.runId}|${decision.node}|${String(decision.round)}`);
  return keys;
}

/** The grid of a panel's check rounds; null when the panel recorded no round. */
export function roundsGrid(
  view: Declaration,
  detail: FactoryItemDetail,
  timeline: readonly TimelineRow[],
  panel: StoryVisit,
  next: StoryVisit | undefined
): RoundsGrid | null {
  const ctx: GridContext = {
    view,
    facts: new Map(detail.runs.map(run => [run.runId, run])),
    rows: new Map(timeline.map(row => [row.runId, row])),
    order: new Map(detail.item.runs.map((run, index) => [run.id, index])),
    numbers: roundNumbers(view, detail),
  };
  const columns = gridColumns(ctx, panel);
  if (columns.length === 0) return null;
  const { checks, fixes: loopFixes } = checkRows(ctx, columns);
  const fixes = addFixRuns(ctx, panel, columns, [], loopFixes);
  const after = nextStageRow(ctx, next, columns.length);
  return {
    columns: columns.map(entry => entry.column),
    rows: [
      ...checks,
      ...(fixes === null ? [] : [fixes]),
      ...(after === null ? [] : [after]),
      ...shadowRows(ctx, columns),
    ],
  };
}

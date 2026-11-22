/**
 * The item page's story (DESIGN.md, The item page): one panel per stage visit in the order it
 * ran (`item-visits.ts`), each opening with one plain sentence of what happened. The sentence
 * is the view's (`story.outcomes`, `story.steps`); the console adds only clauses about its own
 * concepts: run status, the pull request a run opened, why the checks sent it back, how many
 * rounds they took, and what you answered. An outcome the view does not tell falls back to a
 * neutral sentence from the timeline's words.
 */
import type { FactoryItemDetail } from '../../skills/factory';
import { answerWords, restartOf } from './answered';
import { answererName } from './item-answers';
import { gridShadowKeys, roundsGrid, type RoundsGrid } from './item-rounds-grid';
import { runPositions, storyVisits, type RunFacts, type StoryVisit } from './item-visits';
import { stageOfWorkflow } from './placement';
import { stepLabel } from './step-label';
import { runHref, type TimelineRow, type TimelineShadow } from './timeline';
import type { FactoryStage } from './stage-steps';
import type { FactoryViewListed } from './views';

type Declaration = FactoryViewListed['declaration'];
type ItemRun = FactoryItemDetail['item']['runs'][number];
type AskAnswer = Extract<FactoryItemDetail['item']['answers'][number], { kind: 'ask' }>;

/** A sentence, and the pack's own token after it in mono where the view does not word it. */
export interface Sentence {
  text: string;
  mono: string | null;
}

/** A long text cut to its first sentence, with the whole of it for "More". */
export interface Reason {
  short: string;
  full: string;
}

/** An ask a panel's run left, answered: what was asked, what you chose, who, and what it started. */
export interface AnsweredAsk {
  question: string;
  chosen: string;
  /** The chosen option's own words, when it had them. */
  does: string | null;
  /** The chosen option's id, for its tag; null for an answer in words. */
  optionId: string | null;
  by: string | null;
  at: string;
  started: string;
  /** The run that asked. */
  runId: string;
}

export interface PanelDetails {
  start: string;
  end: string | null;
  durationMs: number | null;
  costUsd: number | null;
  /**
   * A run of this panel worked other stages too (a loop-form delivery): its cost and models are
   * the whole run's, recorded once per run, so they cannot be split by stage.
   */
  wholeRun: boolean;
  models: string[];
  runs: { id: string; href: string }[];
}

interface PanelBase {
  key: string;
  sentence: Sentence;
  details: PanelDetails;
  shadows: TimelineShadow[];
}

export interface StagePanel extends PanelBase {
  kind: 'stage';
  stage: FactoryStage;
  number: number;
  /** The pull request a run of this panel named first on the item. */
  pr: { url: string; label: string } | null;
  /** Why it was sent back, when the panel ended so. */
  reason: Reason | null;
  answered: AnsweredAsk[];
  /** What you answered the panel's last run, for the sentence's "; you said" clause. */
  youSaid: string | null;
  /** The runs whose open asks show in this panel. */
  runIds: string[];
  grid: RoundsGrid | null;
  /** When the change merged, on the Merged stage's panel. */
  merged: string | null;
}

export interface DrainPanel extends PanelBase {
  kind: 'drain';
}

/** The change merged with no run of the Merged stage to tell it (a person merged it). */
export interface MergedPanel {
  kind: 'merged';
  key: string;
  stage: FactoryStage | undefined;
  at: string | null;
}

export type StoryPanel = StagePanel | DrainPanel | MergedPanel;

interface StoryContext {
  view: Declaration;
  projectId: string;
  detail: FactoryItemDetail;
  runs: ReadonlyMap<string, ItemRun>;
  facts: ReadonlyMap<string, RunFacts>;
  rows: ReadonlyMap<string, TimelineRow>;
  now: number;
}

const MAX_SHORT = 140;
/** A first sentence shorter than this ("Return.") says too little alone; the next joins it. */
const MIN_SHORT = 40;

/**
 * A text's opening, for one line: its sentences up to the first line end, until they say at
 * least about 40 characters, cut at about 140. Display only: nothing reads meaning from it.
 */
export function firstSentence(text: string): string {
  const line = text.trim().split('\n')[0] ?? '';
  const stops = [...line.matchAll(/[.!?](\s|$)/g)].map(stop => (stop.index ?? 0) + 1);
  const end = stops.find(at => at >= MIN_SHORT) ?? line.length;
  const cut = line.slice(0, end);
  return cut.length <= MAX_SHORT ? cut : `${cut.slice(0, MAX_SHORT - 1).trimEnd()}…`;
}

const reasonOf = (text: string | null | undefined): Reason | null =>
  text == null || text.trim() === '' ? null : { short: firstSentence(text), full: text.trim() };

/** "once", "twice", "3 times". */
export function times(count: number): string {
  if (count === 1) return 'once';
  if (count === 2) return 'twice';
  return `${count.toString()} times`;
}

/** What the view says a completed run did: `workflow:outcome`, else `workflow:*`. */
export function toldOutcome(view: Declaration, workflow: string, outcome: string | null) {
  const told = view.story?.outcomes;
  if (told === undefined) return undefined;
  return (outcome === null ? undefined : told[`${workflow}:${outcome}`]) ?? told[`${workflow}:*`];
}

/** A run that has not finished: what it is doing, in the stage's name. */
function statusSentence(ctx: StoryContext, label: string, run: ItemRun): string | null {
  const row = ctx.rows.get(run.id);
  if (run.awaitingExecution !== null || run.status === 'pending')
    return `${label} is waiting to start`;
  if (run.status === 'running' || run.status === 'paused') {
    const step = row?.liveStepName;
    return step == null
      ? `${label} is working on it now`
      : `${label} is working on it now: ${step}`;
  }
  if (run.status === 'cancelled') return `${label} was stopped`;
  if (run.status !== 'failed') return null;
  const failed = ctx.detail.item.progress?.runs.find(entry => entry.runId === run.id)?.failedStep;
  const workflow = ctx.facts.get(run.id)?.workflow;
  return failed == null || workflow == null
    ? `${label} failed`
    : `${label} failed at ${stepLabel(ctx.view, workflow, failed)}`;
}

/**
 * The checks' rounds in a sentence: how often they sent it back, and how the last round ended.
 * A round with neither a return nor an approval reads "asked you" only when one of its checks
 * recorded an outcome the view means as asked; a replan, or a round that stopped, is null, so
 * the run's own sentence tells it.
 */
function roundsSentence(label: string, grid: RoundsGrid): string | null {
  const last = grid.columns.at(-1)?.verdict;
  const index = grid.columns.length - 1;
  const asked = grid.rows.some(
    row => !row.shadow && row.cells[index]?.some(cell => cell.meaning === 'asked') === true
  );
  const back = grid.columns.filter(column => column.verdict === 'returned').length;
  if (last === 'returned') return `${label} sent it back${back > 1 ? ` ${times(back)}` : ''}`;
  const then = back === 0 ? `${label} ` : `${label} sent it back ${times(back)}, then `;
  if (last === 'approved') return `${then}approved it`;
  if (last === 'undecided' && asked) return `${then}asked you`;
  return null;
}

/**
 * A completed run's sentence on this panel: the view's for its outcome when this is the last
 * stage the run worked; for an earlier stage of a run that works several, the view's for the
 * step it started that stage on; else the neutral words.
 */
function runSentence(ctx: StoryContext, panel: StoryVisit, run: ItemRun): Sentence {
  const facts = ctx.facts.get(run.id);
  const workflow = facts?.workflow ?? null;
  const row = ctx.rows.get(run.id);
  const neutral: Sentence =
    row?.outcome.mono === true
      ? { text: `${panel.stage.label} finished:`, mono: row.outcome.text }
      : { text: `${panel.stage.label} finished: ${row?.outcome.text ?? 'done'}`, mono: null };
  if (workflow === null) return neutral;
  const last = runPositions(ctx.view, run, facts).at(-1)?.stage.id === panel.stage.id;
  if (last) {
    const told = toldOutcome(ctx.view, workflow, run.outcome);
    return told === undefined ? neutral : { text: told, mono: null };
  }
  // An earlier stage of a run that works several: its outcome is a later stage's to tell.
  const steps = ctx.view.story?.steps?.[workflow] ?? {};
  const started = panel.positions.find(p => p.runId === run.id && p.node !== null && steps[p.node]);
  const told = started?.node == null ? undefined : steps[started.node];
  return { text: told ?? `${panel.stage.label} did its part`, mono: null };
}

function panelSentence(ctx: StoryContext, panel: StoryVisit, grid: RoundsGrid | null): Sentence {
  const runId = panel.runIds.at(-1) ?? '';
  const run = ctx.runs.get(runId);
  if (run === undefined) return { text: panel.stage.label, mono: null };
  const status = statusSentence(ctx, panel.stage.label, run);
  if (status !== null) return { text: status, mono: null };
  const rounds = grid === null ? null : roundsSentence(panel.stage.label, grid);
  return rounds === null ? runSentence(ctx, panel, run) : { text: rounds, mono: null };
}

/** Why the panel sent the item back, when its last run or round did: the round's or run's words. */
function panelReason(ctx: StoryContext, panel: StoryVisit, grid: RoundsGrid | null): Reason | null {
  const last = grid?.columns.at(-1);
  if (last !== undefined) return last.verdict === 'returned' ? reasonOf(last.reason) : null;
  const runId = panel.runIds.at(-1) ?? '';
  if (ctx.rows.get(runId)?.kind !== 'returned') return null;
  return reasonOf(ctx.facts.get(runId)?.said);
}

/** Each pull request the item's runs named, by the run that named it first. */
function firstNamers(detail: FactoryItemDetail): Map<string, string> {
  const first = new Map<string, string>();
  for (const run of detail.runs)
    if (run.change !== null && ![...first.values()].includes(run.change))
      first.set(run.runId, run.change);
  return first;
}

const prLabel = (url: string): string => {
  const number = /\/(\d+)\/?$/.exec(url)?.[1];
  return number === undefined ? 'the change' : `PR #${number}`;
};

function answeredAsks(ctx: StoryContext, panel: StoryVisit): AnsweredAsk[] {
  const runs = new Set(panel.allRunIds);
  return ctx.detail.item.answers
    .filter((answer): answer is AskAnswer => answer.kind === 'ask' && !answer.withdrawn)
    .filter(answer => answer.runId !== null && runs.has(answer.runId))
    .map(answer => {
      const restart = restartOf(ctx.view, ctx.detail.item, answer.runId ?? '');
      return {
        question: answer.question,
        chosen: answerWords(answer),
        does: answer.chosen?.does ?? null,
        optionId: answer.chosen?.id ?? null,
        by: answererName(answer.by),
        at: answer.at,
        started: restart === null ? 'Nothing started' : `${restart.label} started again`,
        runId: answer.runId ?? '',
      };
    });
}

/** The answer to the panel's last run's ask, when that run asked: the sentence ends on it. */
function lastAnswer(answered: readonly AnsweredAsk[], panel: StoryVisit): string | null {
  const last = panel.runIds.at(-1);
  return answered.filter(answer => answer.runId === last).at(-1)?.chosen ?? null;
}

/** When a stretch of work started and ended, as ISO times; a null end while it goes on. */
interface Span {
  start: string;
  end: string | null;
}

/** The runs' own span: the first start to the last end. */
function runsSpan(ctx: StoryContext, runIds: readonly string[]): Span {
  const runs = runIds.flatMap(id => ctx.runs.get(id) ?? []);
  const ends = runs.map(run => run.completedAt);
  return {
    start: runs[0]?.startedAt ?? '',
    end: ends.includes(null) ? null : (ends.at(-1) ?? null),
  };
}

/**
 * A panel's span: from its first position, to where the item moved on when its last run went
 * on to the next panel (a run that works several stages), else to its runs' end.
 */
function panelSpan(ctx: StoryContext, panel: StoryVisit, next: StoryVisit | undefined): Span {
  const own = runsSpan(ctx, panel.allRunIds);
  const first = panel.positions[0]?.at;
  const start = first === undefined ? own.start : new Date(first).toISOString();
  const last = panel.allRunIds.at(-1);
  const onward = next?.positions[0]?.at;
  if (last !== undefined && onward !== undefined && next?.allRunIds.includes(last))
    return { start, end: new Date(onward).toISOString() };
  return { start, end: own.end };
}

function details(
  ctx: StoryContext,
  runIds: readonly string[],
  span: Span,
  wholeRun: boolean
): PanelDetails {
  const costs = runIds.flatMap(id => ctx.facts.get(id)?.costUsd ?? []);
  const until = span.end === null ? ctx.now : Date.parse(span.end);
  return {
    ...span,
    durationMs: span.start === '' ? null : Math.max(0, until - Date.parse(span.start)),
    costUsd: costs.length === 0 ? null : costs.reduce((sum, cost) => sum + cost, 0),
    wholeRun,
    models: [...new Set(runIds.flatMap(id => ctx.facts.get(id)?.models ?? []))],
    runs: runIds.map(id => ({ id, href: runHref(ctx.projectId, id) })),
  };
}

/**
 * The shadow decisions that belong in this panel and its grid does not show already: each
 * decision sits with the stage its step is on, so a delivery's round checks go to its Checks
 * panel, not to the Build panel the same run opened.
 */
function panelShadows(
  ctx: StoryContext,
  panel: StoryVisit,
  grid: RoundsGrid | null
): TimelineShadow[] {
  const shown = gridShadowKeys(grid, ctx.facts);
  const here = new Set(
    panel.allRunIds.flatMap(id => {
      const facts = ctx.facts.get(id);
      return (facts?.shadows ?? [])
        .filter(decision => {
          const stage = stageOfWorkflow(ctx.view, facts?.workflow ?? '', decision.node);
          return stage === undefined || stage.id === panel.stage.id;
        })
        .map(decision => `${decision.runId}|${decision.node}|${String(decision.round)}`);
    })
  );
  return panel.allRunIds
    .flatMap(id => ctx.rows.get(id)?.shadows ?? [])
    .filter(shadow => here.has(shadow.key) && !shown.has(shadow.key));
}

function stagePanel(
  ctx: StoryContext,
  panel: StoryVisit,
  next: StoryVisit | undefined,
  firsts: Map<string, string>,
  shared: boolean
): StagePanel {
  const grid = roundsGrid(ctx.view, ctx.detail, [...ctx.rows.values()], panel, next);
  const named = panel.allRunIds.find(id => firsts.has(id));
  const url = named === undefined ? undefined : firsts.get(named);
  if (named !== undefined) firsts.delete(named);
  const change = ctx.detail.item.progress?.change;
  const answered = answeredAsks(ctx, panel);
  return {
    kind: 'stage',
    key: `${panel.stage.id}:${panel.number.toString()}`,
    stage: panel.stage,
    number: panel.number,
    sentence: panelSentence(ctx, panel, grid),
    pr: url === undefined ? null : { url, label: prLabel(url) },
    reason: panelReason(ctx, panel, grid),
    answered,
    youSaid: lastAnswer(answered, panel),
    runIds: panel.allRunIds,
    grid,
    details: details(ctx, panel.allRunIds, panelSpan(ctx, panel, next), shared),
    shadows: panelShadows(ctx, panel, grid),
    merged:
      panel.stage.id === ctx.view.landed.stage && change?.merged === true
        ? (change.mergedAt ?? null)
        : null,
  };
}

/** The discoveries drain's runs: on no stage, told quietly after the stage that started them. */
function drainPanels(ctx: StoryContext): (DrainPanel & { at: number })[] {
  const drain = ctx.view.discoveries?.workflow;
  if (drain === undefined) return [];
  return ctx.detail.item.runs
    .filter(run => ctx.facts.get(run.id)?.workflow === drain)
    .map(run => ({
      kind: 'drain',
      key: `drain:${run.id}`,
      at: Date.parse(run.startedAt),
      sentence: {
        text:
          statusSentence(ctx, 'The factory', run) ??
          toldOutcome(ctx.view, drain, run.outcome) ??
          'The factory looked for other work',
        mono: null,
      },
      details: details(ctx, [run.id], runsSpan(ctx, [run.id]), false),
      shadows: ctx.rows.get(run.id)?.shadows ?? [],
    }));
}

/**
 * Every panel of the story in the order it ran: the stage visits, the drains among them by
 * start, and a last Merged panel when the change merged and no run of the Merged stage tells it.
 */
export function itemStory(
  view: Declaration,
  projectId: string,
  detail: FactoryItemDetail,
  timeline: readonly TimelineRow[],
  now: number
): StoryPanel[] {
  const ctx: StoryContext = {
    view,
    projectId,
    detail,
    runs: new Map(detail.item.runs.map(run => [run.id, run])),
    facts: new Map(detail.runs.map(run => [run.runId, run])),
    rows: new Map(timeline.map(row => [row.runId, row])),
    now,
  };
  const visits = storyVisits(view, detail);
  const firsts = firstNamers(detail);
  const panelsOf = (id: string) => visits.filter(visit => visit.allRunIds.includes(id)).length;
  const stages = visits.map((visit, index) => ({
    panel: stagePanel(
      ctx,
      visit,
      visits[index + 1],
      firsts,
      visit.allRunIds.some(id => panelsOf(id) > 1)
    ),
    at: visit.positions[0]?.at ?? 0,
  }));
  const ordered = [...stages, ...drainPanels(ctx).map(panel => ({ panel, at: panel.at }))]
    .sort((a, b) => a.at - b.at)
    .map(entry => entry.panel);
  const change = detail.item.progress?.change;
  const told = stages.some(entry => entry.panel.stage.id === view.landed.stage);
  if (change?.merged !== true || told) return ordered;
  const stage = view.stages.find(entry => entry.id === view.landed.stage);
  return [...ordered, { kind: 'merged', key: 'merged', stage, at: change.mergedAt }];
}

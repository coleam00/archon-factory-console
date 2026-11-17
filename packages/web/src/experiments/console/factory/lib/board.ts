/**
 * The board, as pure derivation: which column each item sits in and what its card says,
 * from the items read and the factory view declaration (DESIGN.md, "The board"). Nothing
 * here names a pack's stages, workflows, steps or outcomes; every one comes from the
 * declaration or the engine's records.
 */
import { formatDateTime } from '../../lib/format';
import type { FactoryItemsPage } from '../../skills/factory';
import { needsYou } from './needs-you';
import { showsCard, type BoardShow } from './board-show';
import { factoryPath, type FactoryViewListed } from './views';

export type FactoryItem = FactoryItemsPage['items'][number];
export type FactoryDeclaration = FactoryViewListed['declaration'];
type Stage = FactoryDeclaration['stages'][number];
type Progress = NonNullable<FactoryItem['progress']>;
export type RoundVerdict = NonNullable<Progress['round']>['rounds'][number]['verdict'];

/** Where an item sits: a column, by the rule that put it there, or the folded endings row. */
export type Placement =
  | { kind: 'column'; stage: string; rule: 1 | 2 | 3 | 5 | 6 }
  | { kind: 'ended'; label: string };

/** One of an item's declared runs: the declared workflow joined with the run's own read. */
interface DeclaredRun {
  runId: string;
  workflow: string;
  failedStep: string | null;
  status: FactoryItem['runs'][number]['status'];
  outcome: string | null;
}

/** The item's declared runs in start order; a run the item read lacks is left out. */
function declaredRuns(item: FactoryItem): DeclaredRun[] {
  const reads = new Map(item.runs.map(run => [run.id, run]));
  return (item.progress?.runs ?? []).flatMap(run => {
    const read = reads.get(run.runId);
    return read === undefined ? [] : [{ ...run, status: read.status, outcome: read.outcome }];
  });
}

const ENDED_STATUSES: ReadonlySet<DeclaredRun['status']> = new Set(['failed', 'cancelled']);

/**
 * Whether `step` of a run of `workflow` counts in `stage`: the stage lists the workflow and
 * declares no steps, or the step equals one or begins with one followed by `.`.
 */
export function stepMatches(stage: Stage, workflow: string, step: string | null): boolean {
  if (!stage.workflows.includes(workflow)) return false;
  if (stage.nodes === undefined) return true;
  return step !== null && stage.nodes.some(node => step === node || step.startsWith(`${node}.`));
}

function firstListing(view: FactoryDeclaration, workflow: string): Stage | undefined {
  return view.stages.find(stage => stage.workflows.includes(workflow));
}

/**
 * The column a running run puts an item in. A step no stage names (a loop group between
 * rounds, an admission step, or none at all between steps) keeps the item where it was when
 * that column lists the workflow, so the card does not hop and flash; else the first stage
 * listing the workflow.
 */
function runningStage(
  view: FactoryDeclaration,
  running: NonNullable<Progress['running']>,
  previous: string | undefined
): Stage | undefined {
  const matched = view.stages.find(stage => stepMatches(stage, running.workflow, running.step));
  if (matched !== undefined) return matched;
  const kept = view.stages.find(
    stage => stage.id === previous && stage.workflows.includes(running.workflow)
  );
  return kept ?? firstListing(view, running.workflow);
}

/** The ending label of a completed run's outcome: its exact key, else its workflow's `*`. */
function endingLabel(view: FactoryDeclaration, run: DeclaredRun): string | undefined {
  if (run.status !== 'completed' || run.outcome === null) return undefined;
  return view.endings[`${run.workflow}:${run.outcome}`] ?? view.endings[`${run.workflow}:*`];
}

/**
 * Where an item sits: the first of the six rules that matches (DESIGN.md, "The board").
 * `previous` is the column it sat in on the last read, if any.
 */
export function placeItem(
  view: FactoryDeclaration,
  item: FactoryItem,
  previous?: string
): Placement {
  const first = view.stages[0]?.id ?? view.landed.stage;
  const progress = item.progress;
  if (progress === null) return { kind: 'column', stage: first, rule: 6 };
  // 1. A run of a declared workflow is running on it.
  if (progress.running !== null) {
    const stage = runningStage(view, progress.running, previous);
    if (stage !== undefined) return { kind: 'column', stage: stage.id, rule: 1 };
  }
  // 2. Its change merged.
  if (progress.change?.merged === true)
    return { kind: 'column', stage: view.landed.stage, rule: 2 };
  const runs = declaredRuns(item);
  // 3. Its last completed run's outcome has a place.
  const completed = runs.filter(run => run.status === 'completed').at(-1);
  const placed =
    completed?.outcome == null
      ? undefined
      : view.placement[`${completed.workflow}:${completed.outcome}`];
  if (placed !== undefined) return { kind: 'column', stage: placed, rule: 3 };
  const last = runs.at(-1);
  // 4. Its last run ended it without a change.
  const ending = last === undefined ? undefined : endingLabel(view, last);
  if (ending !== undefined) return { kind: 'ended', label: ending };
  // 5. Its last run failed or was cancelled: the stage of the step it failed at.
  if (last !== undefined && ENDED_STATUSES.has(last.status)) {
    const stage =
      view.stages.find(candidate => stepMatches(candidate, last.workflow, last.failedStep)) ??
      firstListing(view, last.workflow);
    if (stage !== undefined) return { kind: 'column', stage: stage.id, rule: 5 };
  }
  // 6. Otherwise the first stage.
  return { kind: 'column', stage: first, rule: 6 };
}

export type Pill = 'running' | 'needs-you' | 'failed' | 'waiting' | 'landed';

export const PILL_LABEL: Record<Pill, string> = {
  running: 'Running',
  'needs-you': 'Needs you',
  failed: 'Failed',
  waiting: 'Waiting',
  landed: 'Landed',
};

/** Plain words for each verdict a round can have; a new verdict fails the type-check here. */
export const VERDICT_LABEL: Record<RoundVerdict, string> = {
  approved: 'approved',
  returned: 'returned',
  undecided: 'needs a decision',
  running: 'running',
  stopped: 'stopped',
};

/** A card's fields, in the order DESIGN.md lists them. */
export interface BoardCard {
  key: string;
  title: string;
  pill: Pill;
  round: {
    text: string;
    dots: { iteration: number; verdict: RoundVerdict; label: string }[];
  } | null;
  /** `text` is "workflow · step"; `workflow` and `step` let a card break the line between them. */
  run: { text: string; workflow: string; step: string | null; href: string } | null;
  returned: { count: number; href: string } | null;
  /**
   * The change, by its pull request number when known. `mergeUnknown` when the change host
   * could not say whether it merged: the card says so rather than reading as unmerged.
   */
  change: { href: string; label: string; mergeUnknown: boolean } | null;
  /** When the change merged, in local time; only in the landed column. */
  landedAt: string | null;
  /** What stopped a failed item, or what an item that needs you asks. */
  stopLine: string | null;
}

/** The item page's path. */
export function itemPath(projectId: string, key: string): string {
  return factoryPath(projectId, `/items/${encodeURIComponent(key)}`);
}

function roundField(progress: Progress | null): BoardCard['round'] {
  const round = progress?.round;
  if (round == null) return null;
  const iteration = round.iteration.toString();
  return {
    text:
      round.max === null ? `round ${iteration}` : `round ${iteration} of ${round.max.toString()}`,
    dots: round.rounds.map(entry => ({
      iteration: entry.iteration,
      verdict: entry.verdict,
      label: `round ${entry.iteration.toString()}: ${VERDICT_LABEL[entry.verdict]}`,
    })),
  };
}

function runField(projectId: string, progress: Progress | null): BoardCard['run'] {
  const running = progress?.running;
  if (running == null) return null;
  return {
    text: running.step === null ? running.workflow : `${running.workflow} · ${running.step}`,
    workflow: running.workflow,
    step: running.step,
    href: `/console/p/${projectId}/r/${running.runId}`,
  };
}

function changeField(progress: Progress | null): BoardCard['change'] {
  const change = progress?.change;
  if (change == null) return null;
  return {
    href: change.url,
    label: change.number === null ? 'the change' : `PR #${change.number.toString()}`,
    mergeUnknown: change.merged === 'unknown',
  };
}

/** What the newest open question asks, in the words the queue gives it. */
function askLine(question: ReturnType<typeof needsYou>[number]): string {
  return question.kind === 'unreadable' ? 'A paused run could not be read.' : question.message;
}

function failedLine(run: DeclaredRun): string {
  if (run.status === 'cancelled') return `${run.workflow} was cancelled`;
  return run.failedStep === null
    ? `${run.workflow} failed`
    : `${run.workflow} failed at ${run.failedStep}`;
}

/** An item's card, given where it was placed. */
export function cardFields(
  view: FactoryDeclaration,
  projectId: string,
  item: FactoryItem,
  placement: Placement
): BoardCard {
  const { key } = item.item;
  const progress = item.progress;
  const landed = placement.kind === 'column' && placement.stage === view.landed.stage;
  const { pill, stopLine } = itemPill(item, landed);
  const mergedAt = progress?.change?.mergedAt ?? null;
  return {
    key,
    title: progress?.title ?? key,
    pill,
    round: roundField(progress),
    run: runField(projectId, progress),
    returned:
      progress !== null && progress.returned > 0
        ? { count: progress.returned, href: itemPath(projectId, key) }
        : null,
    change: changeField(progress),
    landedAt: landed && mergedAt !== null ? formatDateTime(mergedAt) : null,
    stopLine,
  };
}

/**
 * The state pill, first that holds: landed (in the landed column), needs you (an open
 * ask), running, failed (the last run failed or was cancelled), else waiting; and the one
 * line saying what an item that needs you asks, or what stopped a failed one. The board's
 * card and the item page's header both read it, so an item says the same in both.
 */
export function itemPill(item: FactoryItem, landed: boolean): Pick<BoardCard, 'pill' | 'stopLine'> {
  const unread = item.progress === null ? 'Its progress could not be read.' : null;
  if (landed) return { pill: 'landed', stopLine: unread };
  const [ask] = needsYou(item.questions);
  if (ask !== undefined) return { pill: 'needs-you', stopLine: unread ?? askLine(ask) };
  if (item.progress?.running != null) return { pill: 'running', stopLine: null };
  const last = declaredRuns(item).at(-1);
  if (last !== undefined && ENDED_STATUSES.has(last.status))
    return { pill: 'failed', stopLine: failedLine(last) };
  return { pill: 'waiting', stopLine: unread };
}

/** A card on the board: the item, where it sits, and what it says. */
export interface PlacedCard {
  item: FactoryItem;
  placement: Placement;
  card: BoardCard;
}

export interface BoardModel {
  /** The declaration's landed stage: the column an item whose change merged sits in. */
  landedStage: string;
  columns: { stage: string; label: string; cards: PlacedCard[] }[];
  /** The folded rows under the board: items an ending took off it, by label. */
  ended: { label: string; cards: PlacedCard[] }[];
  /** Where every item sits, filter or not: a column id, or `ended:<label>`. */
  positions: Map<string, string>;
}

/** Where a placement puts an item, as one comparable string. */
export function positionOf(placement: Placement): string {
  return placement.kind === 'column' ? placement.stage : `ended:${placement.label}`;
}

/** Whether `query` finds the card by key or title, ignoring case. An empty query finds all. */
export function cardMatches(card: BoardCard, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return card.key.toLowerCase().includes(needle) || card.title.toLowerCase().includes(needle);
}

/**
 * The board for these items. Columns are the declared stages in order, the landed stage
 * among them. `previous` holds each item's position on the last read.
 */
export function boardModel(
  view: FactoryDeclaration,
  projectId: string,
  items: readonly FactoryItem[],
  previous: ReadonlyMap<string, string>
): BoardModel {
  const columns = view.stages.map(stage => ({
    stage: stage.id,
    label: stage.label,
    cards: [] as PlacedCard[],
  }));
  const ended = new Map<string, PlacedCard[]>();
  const positions = new Map<string, string>();
  for (const item of items) {
    const placement = placeItem(view, item, previous.get(item.item.key));
    positions.set(item.item.key, positionOf(placement));
    const placed = { item, placement, card: cardFields(view, projectId, item, placement) };
    if (placement.kind === 'ended')
      ended.set(placement.label, [...(ended.get(placement.label) ?? []), placed]);
    else columns.find(column => column.stage === placement.stage)?.cards.push(placed);
  }
  return {
    landedStage: view.landed.stage,
    columns,
    ended: [...ended].map(([label, cards]) => ({ label, cards })),
    positions,
  };
}

/**
 * The board narrowed to the cards `query` finds by key or title and, when given, to the
 * cards `show` picks (the numbers strip's links). While `show` narrows it, the folded
 * endings are hidden: no number counts them. `positions` keeps every item, so narrowing
 * never reads as a card moving.
 */
export function filterBoard(
  model: BoardModel,
  query: string,
  show?: BoardShow,
  now: Date = new Date()
): BoardModel {
  if (query.trim() === '' && show === undefined) return model;
  const landed = model.landedStage;
  const keep = (cards: PlacedCard[]): PlacedCard[] =>
    cards.filter(
      placed =>
        cardMatches(placed.card, query) &&
        (show === undefined || showsCard(show, placed, landed, now))
    );
  return {
    ...model,
    columns: model.columns.map(column => ({ ...column, cards: keep(column.cards) })),
    ended:
      show === undefined
        ? model.ended
            .map(group => ({ ...group, cards: keep(group.cards) }))
            .filter(group => group.cards.length > 0)
        : [],
  };
}

/** The items whose position changed between two reads; an item new on the board did not move. */
export function movedKeys(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>
): string[] {
  return [...after]
    .filter(([key, position]) => before.has(key) && before.get(key) !== position)
    .map(([key]) => key);
}

/** The hint for columns scrolled out of view, naming them; null when every column shows. */
export function hiddenColumnsHint(
  columns: readonly { stage: string; label: string }[],
  visible: ReadonlySet<string>
): string | null {
  const hidden = columns.filter(column => !visible.has(column.stage)).map(column => column.label);
  return hidden.length === 0 ? null : `Scroll for: ${hidden.join(', ')}`;
}

/**
 * The board, as pure derivation: what each item's card says and how the cards group into
 * columns, from the items read and the factory view declaration (DESIGN.md, "The board").
 * Which column an item sits in is `placement.ts`'s, the one placement the map and the item
 * page share. Nothing
 * here names a pack's stages, workflows, steps or outcomes; every one comes from the
 * declaration or the engine's records.
 */
import { formatDateTime } from '../../lib/format';
import type { FactoryItem } from '../../skills/factory';
import { needsYou, ownerLostMessage } from './needs-you';
import { showsCard, type BoardShow } from './board-show';
import { anyMergePending, stageCountPending, type ChangeMerged } from './merge-pending';
import { pageItemColumn, type ItemColumn } from './placement';
import { runLine, stepLabel, type RunLine } from './step-label';
import { factoryPath, type FactoryViewListed } from './views';

export type FactoryDeclaration = FactoryViewListed['declaration'];
type Progress = NonNullable<FactoryItem['progress']>;
export type RoundVerdict = NonNullable<Progress['round']>['rounds'][number]['verdict'];

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
  /**
   * What the running run is doing, as `runLine` words it; `step` is the raw engine id, for
   * the hover title only.
   */
  run: (RunLine & { step: string | null; href: string }) | null;
  returned: { count: number; href: string } | null;
  /**
   * The change, by its pull request number when known. `mergeState` when the change host
   * could not say whether it merged (`unknown`) or the server is still asking (`pending`):
   * the card says so rather than reading as unmerged.
   */
  change: { href: string; label: string; mergeState: Extract<ChangeMerged, string> | null } | null;
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

function runField(
  view: FactoryDeclaration,
  projectId: string,
  progress: Progress | null,
  column: ItemColumn | null
): BoardCard['run'] {
  const running = progress?.running;
  if (running == null) return null;
  const placed = column !== null && 'stage' in column ? column.stage : undefined;
  return {
    ...runLine(view, running, progress?.round, placed),
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
    mergeState: typeof change.merged === 'string' ? change.merged : null,
  };
}

/** What the newest open question asks, in the words the queue gives it. */
function askLine(question: ReturnType<typeof needsYou>[number]): string {
  switch (question.kind) {
    case 'unreadable':
      return 'A paused run could not be read.';
    case 'owner_lost':
      return ownerLostMessage(question);
    default:
      return question.message;
  }
}

function failedLine(view: FactoryDeclaration, run: DeclaredRun): string {
  if (run.status === 'cancelled') return `${run.workflow} was cancelled`;
  return run.failedStep === null
    ? `${run.workflow} failed`
    : `${run.workflow} failed at ${stepLabel(view, run.workflow, run.failedStep)}`;
}

/** An item's card, given where it was placed (`itemColumn`). */
export function cardFields(
  view: FactoryDeclaration,
  projectId: string,
  item: FactoryItem,
  column: ItemColumn | null
): BoardCard {
  const { key } = item.item;
  const progress = item.progress;
  const landed = column !== null && 'stage' in column && column.stage.id === view.landed.stage;
  const { pill, stopLine } = itemPill(view, item, landed);
  const mergedAt = progress?.change?.mergedAt ?? null;
  return {
    key,
    title: progress?.title ?? key,
    pill,
    round: roundField(progress),
    run: runField(view, projectId, progress, column),
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
export function itemPill(
  view: FactoryDeclaration,
  item: FactoryItem,
  landed: boolean
): Pick<BoardCard, 'pill' | 'stopLine'> {
  const unread = item.progress === null ? 'Its progress could not be read.' : null;
  if (landed) return { pill: 'landed', stopLine: unread };
  const [ask] = needsYou(item.questions);
  if (ask !== undefined) return { pill: 'needs-you', stopLine: unread ?? askLine(ask) };
  if (item.progress?.running != null) return { pill: 'running', stopLine: null };
  const last = declaredRuns(item).at(-1);
  if (last !== undefined && ENDED_STATUSES.has(last.status))
    return { pill: 'failed', stopLine: failedLine(view, last) };
  return { pill: 'waiting', stopLine: unread };
}

/** A card on the board: the item, where it sits, and what it says. */
export interface PlacedCard {
  item: FactoryItem;
  /** Null when no declared stage holds it, which a view changed under cached items can cause. */
  column: ItemColumn | null;
  card: BoardCard;
}

export interface BoardModel {
  /** The declaration's landed stage: the column an item whose change merged sits in. */
  landedStage: string;
  /**
   * `pending` when the column's count waits on a merge answer (`stageCountPending`): its
   * header shows loading rather than a count that may be wrong.
   */
  columns: { stage: string; label: string; cards: PlacedCard[]; pending: boolean }[];
  /**
   * The folded rows under the board: items an ending took off it, by label, and items
   * placement found no column for, under `UNPLACED_LABEL`.
   */
  ended: { label: string; cards: PlacedCard[] }[];
  /** Where every item sits, filter or not: a column id, or `ended:<label>`. */
  positions: Map<string, string>;
}

/** The folded row of items placement found no column for; the item page says the same. */
export const UNPLACED_LABEL = 'Position unknown';

/** Where an item sits, as one comparable string: a column id, or `ended:<label>`. */
export function positionOf(column: ItemColumn | null): string {
  if (column === null) return `ended:${UNPLACED_LABEL}`;
  return 'ended' in column ? `ended:${column.ended}` : column.stage.id;
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
    pending: false,
  }));
  const ended = new Map<string, PlacedCard[]>();
  const positions = new Map<string, string>();
  for (const item of items) {
    const column = pageItemColumn(view, item, previous.get(item.item.key));
    positions.set(item.item.key, positionOf(column));
    const placed = { item, column, card: cardFields(view, projectId, item, column) };
    if (column === null || 'ended' in column) {
      const label = column === null ? UNPLACED_LABEL : column.ended;
      ended.set(label, [...(ended.get(label) ?? []), placed]);
    } else columns.find(entry => entry.stage === column.stage.id)?.cards.push(placed);
  }
  const anyPending = anyMergePending(items);
  for (const column of columns) {
    const held = column.cards.map(placed => placed.item);
    column.pending = stageCountPending(column.stage, view.landed.stage, held, anyPending);
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

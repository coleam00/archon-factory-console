/**
 * The board, as pure derivation: what each item's card says and how the cards group into
 * columns, from the items read and the factory view declaration (DESIGN.md, "The board").
 * Which column an item sits in is `placement.ts`'s, the one placement the map and the item
 * page share. Nothing
 * here names a pack's stages, workflows, steps or outcomes; every one comes from the
 * declaration or the engine's records.
 */
import { formatDateTime } from '../../lib/format';
import { displayItemKey } from './item-key';
import type { FactoryItem } from '../../skills/factory';
import { askQuestion } from '../../lib/ask-card';
import { needsYou } from '../../lib/needs-you';
import { BOARD_SHOW, showsCard, type BoardShow } from './board-show';
import { boardColumns, type BoardColumnDecl } from './board-columns';
import { anyMergePending, stageCountPending, type ChangeMerged } from './merge-pending';
import { pageItemColumn, stageOfWorkflow, type ItemColumn } from './placement';
import { boardShadowLine, type ShadowWords } from './shadows';
import { roundsSources, runLine, stepLabel, type RunLine } from './step-label';
import { factoryPath, type FactoryViewListed } from './views';
import { membershipOf } from './work-orders';

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

export type Pill = 'running' | 'needs-you' | 'failed' | 'parked' | 'waiting' | 'landed';

export const PILL_LABEL: Record<Pill, string> = {
  running: 'Running',
  'needs-you': 'Needs you',
  failed: 'Failed',
  parked: 'Parked',
  waiting: 'Waiting',
  landed: 'Merged',
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
  /**
   * The label of the stage the item sits in, so a card names it inside a column that groups
   * several; null for a merged card, whose column says it, and for an item in no stage.
   */
  stage: string | null;
  returned: { count: number; href: string } | null;
  /**
   * The change, by its pull request number when known. `mergeState` when the change host
   * could not say whether it merged (`unknown`) or the server is still asking (`pending`):
   * the card says so rather than reading as unmerged. `href` is null while the change host
   * has not named the pull request of a run that named no URL.
   */
  change: {
    href: string | null;
    label: string;
    mergeState: Extract<ChangeMerged, string> | null;
  } | null;
  /** When the change merged, in local time; only in the landed stage. */
  mergedAt: string | null;
  /** What stopped a failed item, or what an item that needs you asks. */
  stopLine: string | null;
  /** The key of the work order the item is part of (`membershipOf`); null when none. */
  order: string | null;
  /**
   * What a shadow step of the item's stage would have done, as `boardShadowLine` picks it
   * ("would ask you first"); null when none decided, and on a card a run works now.
   */
  shadow: ShadowWords | null;
}

/** The item page's path. */
export function itemPath(projectId: string, key: string): string {
  return factoryPath(projectId, `/items/${encodeURIComponent(key)}`);
}

/**
 * Whether a run of a stage-form rounds workflow works the item now: a round its result has
 * not numbered yet. It is never one of `progress.round`'s, which only completed runs give.
 */
export function newRoundRunning(view: FactoryDeclaration, progress: Progress | null): boolean {
  const running = progress?.running;
  if (running == null) return false;
  return roundsSources(view).some(
    source => !('loop' in source) && source.workflow === running.workflow
  );
}

function roundField(view: FactoryDeclaration, progress: Progress | null): BoardCard['round'] {
  const round = progress?.round ?? null;
  const next = newRoundRunning(view, progress);
  if (round === null && !next) return null;
  const dots: NonNullable<BoardCard['round']>['dots'] = (round?.rounds ?? []).map(entry => ({
    iteration: entry.iteration,
    verdict: entry.verdict,
    label: `round ${entry.iteration.toString()}: ${VERDICT_LABEL[entry.verdict]}`,
  }));
  if (round === null)
    return {
      text: 'first round running',
      dots: [{ iteration: 1, verdict: 'running', label: 'first round: running' }],
    };
  const iteration = round.iteration.toString();
  const text =
    round.max === null ? `round ${iteration}` : `round ${iteration} of ${round.max.toString()}`;
  if (!next) return { text, dots };
  // Its words name no number: after a replan the running round is the first of a new count,
  // not N+1. The dot's iteration is only its key.
  return {
    text: `${text}, next one running`,
    dots: [
      ...dots,
      { iteration: round.iteration + 1, verdict: 'running', label: 'next round: running' },
    ],
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

/**
 * What stopped a failed run, naming its stage ("Build failed at Writes the change"), never the
 * workflow: a run's workflow is the pack's full id, which a person does not read.
 */
function failedLine(view: FactoryDeclaration, run: DeclaredRun, placed: string | null): string {
  const stage = stageOfWorkflow(view, run.workflow, run.failedStep)?.label ?? placed ?? 'The run';
  if (run.status === 'cancelled') return `${stage} was cancelled`;
  return run.failedStep === null
    ? `${stage} failed`
    : `${stage} failed at ${stepLabel(view, run.workflow, run.failedStep)}`;
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
  const placed = column !== null && 'stage' in column ? column.stage.label : null;
  const { pill, stopLine } = itemPill(view, item, landed, placed);
  const mergedAt = progress?.change?.mergedAt ?? null;
  const order = membershipOf(item)?.order ?? null;
  return {
    key,
    title: progress?.title ?? displayItemKey(key, order),
    pill,
    round: roundField(view, progress),
    run: runField(view, projectId, progress, column),
    stage: !landed && column !== null && 'stage' in column ? column.stage.label : null,
    returned:
      progress !== null && progress.returned > 0
        ? { count: progress.returned, href: itemPath(projectId, key) }
        : null,
    change: changeField(progress),
    mergedAt: landed && mergedAt !== null ? formatDateTime(mergedAt) : null,
    stopLine,
    order,
    shadow: boardShadowLine(item, column !== null && 'stage' in column ? column.stage : null, view),
  };
}

/**
 * The state pill, first that holds: landed (in the landed column), needs you (an open
 * ask), running, failed (the last run failed or was cancelled), parked (the last run kept it
 * open for later, `progress.parked`), else waiting; and the one
 * line saying what an item that needs you asks, or what stopped a failed one. The board's
 * card and the item page's header both read it, so an item says the same in both.
 */
export function itemPill(
  view: FactoryDeclaration,
  item: FactoryItem,
  landed: boolean,
  /** The label of the stage the item is placed in, named when a failed run's stage is not known. */
  placed: string | null = null
): Pick<BoardCard, 'pill' | 'stopLine'> {
  const unread = item.progress === null ? 'Its progress could not be read.' : null;
  if (landed) return { pill: 'landed', stopLine: unread };
  const [ask] = needsYou(item.questions);
  if (ask !== undefined) return { pill: 'needs-you', stopLine: unread ?? askQuestion(ask) };
  if (item.progress?.running != null) return { pill: 'running', stopLine: null };
  const last = declaredRuns(item).at(-1);
  if (last !== undefined && ENDED_STATUSES.has(last.status))
    return { pill: 'failed', stopLine: failedLine(view, last, placed) };
  if (item.progress?.parked != null) return { pill: 'parked', stopLine: null };
  return { pill: 'waiting', stopLine: unread };
}

/** A card on the board: the item, where it sits, and what it says. */
export interface PlacedCard {
  item: FactoryItem;
  /** Null when no declared stage holds it, which a view changed under cached items can cause. */
  column: ItemColumn | null;
  card: BoardCard;
}

/**
 * A board column: a group of stages (`board-columns.ts`) and the cards placed on them.
 * `pending` when its count waits on a merge answer (`stageCountPending`) for any of its
 * stages: its header shows loading rather than a count that may be wrong.
 */
export interface BoardColumn extends BoardColumnDecl {
  cards: PlacedCard[];
  pending: boolean;
}

export interface BoardModel {
  /** The declaration's landed stage: the stage an item whose change merged sits in. */
  landedStage: string;
  /** The id of the column holding the landed stage: the Merged column. */
  landedColumn: string;
  columns: BoardColumn[];
  /**
   * The folded rows under the board: items an ending took off it, by label, and items
   * placement found no column for, under `UNPLACED_LABEL`.
   */
  ended: { label: string; cards: PlacedCard[] }[];
  /**
   * Where every item sits, filter or not: a stage id (not its column's: placement holds a run
   * between named steps in the stage it read last), or `ended:<label>`.
   */
  positions: Map<string, string>;
}

/** The folded row of items placement found no column for; the item page says the same. */
export const UNPLACED_LABEL = 'Position unknown';

/** Where an item sits, as one comparable string: a stage id, or `ended:<label>`. */
export function positionOf(column: ItemColumn | null): string {
  if (column === null) return `ended:${UNPLACED_LABEL}`;
  return 'ended' in column ? `ended:${column.ended}` : column.stage.id;
}

/**
 * Whether `query` finds the card by key, title or the key of its work order, ignoring case.
 * An empty query finds all.
 */
export function cardMatches(card: BoardCard, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return [card.key, card.title, card.order ?? ''].some(field =>
    field.toLowerCase().includes(needle)
  );
}

/**
 * The board for these items. Columns are the declared columns in order (one per stage when
 * the view declares none), the landed stage's among them; a card goes to the column holding
 * its stage. `previous` holds each item's position on the last read.
 */
export function boardModel(
  view: FactoryDeclaration,
  projectId: string,
  items: readonly FactoryItem[],
  previous: ReadonlyMap<string, string>
): BoardModel {
  const columns: BoardColumn[] = boardColumns(view).map(column => ({
    ...column,
    cards: [],
    pending: false,
  }));
  const byStage = new Map(
    columns.flatMap(column => column.stages.map(stage => [stage, column] as const))
  );
  const ended = new Map<string, PlacedCard[]>();
  const fold = (label: string, placed: PlacedCard): void => {
    ended.set(label, [...(ended.get(label) ?? []), placed]);
  };
  const positions = new Map<string, string>();
  for (const item of items) {
    const column = pageItemColumn(view, item, previous.get(item.item.key));
    positions.set(item.item.key, positionOf(column));
    const placed = { item, column, card: cardFields(view, projectId, item, column) };
    const stage = stageIdOf(placed);
    const holder = stage === null ? undefined : byStage.get(stage);
    // The schema puts every stage in one column; a stage in none still folds, never drops.
    if (holder !== undefined) holder.cards.push(placed);
    else fold(column !== null && 'ended' in column ? column.ended : UNPLACED_LABEL, placed);
  }
  const anyPending = anyMergePending(items);
  for (const column of columns)
    column.pending = column.stages.some(stage =>
      stageCountPending(
        stage,
        view.landed.stage,
        column.cards.flatMap(placed => (stageIdOf(placed) === stage ? [placed.item] : [])),
        anyPending
      )
    );
  return {
    landedStage: view.landed.stage,
    landedColumn: byStage.get(view.landed.stage)?.id ?? view.landed.stage,
    columns,
    ended: [...ended].map(([label, cards]) => ({ label, cards })),
    positions,
  };
}

/**
 * The board narrowed to the cards `query` finds by key, title or work order and, when given, to the
 * cards `show` picks (the numbers strip's links). While `show` narrows it, the folded
 * endings are hidden: no number counts them. A show that narrows nothing (Found opens a
 * panel) leaves the board to the query. `positions` keeps every item, so narrowing never
 * reads as a card moving.
 */
export function filterBoard(
  model: BoardModel,
  query: string,
  show?: BoardShow,
  now: Date = new Date()
): BoardModel {
  const narrowing = show !== undefined && BOARD_SHOW[show].narrows ? show : undefined;
  if (query.trim() === '' && narrowing === undefined) return model;
  const landed = model.landedStage;
  const keep = (cards: PlacedCard[]): PlacedCard[] =>
    cards.filter(
      placed =>
        cardMatches(placed.card, query) &&
        (narrowing === undefined || showsCard(narrowing, placed, landed, now))
    );
  return {
    ...model,
    columns: model.columns.map(column => ({ ...column, cards: keep(column.cards) })),
    ended:
      narrowing === undefined
        ? model.ended
            .map(group => ({ ...group, cards: keep(group.cards) }))
            .filter(group => group.cards.length > 0)
        : [],
  };
}

/** The stage a placed card sits in; null for one an ending folded away or none holds. */
export function stageIdOf(placed: Pick<PlacedCard, 'column'>): string | null {
  const { column } = placed;
  return column !== null && 'stage' in column ? column.stage.id : null;
}

type ChipPill = Exclude<Pill, 'landed'>;
const CHIP_PILLS: readonly ChipPill[] = ['running', 'needs-you', 'failed', 'parked', 'waiting'];

/**
 * A column header's state chips: how many of its cards run, need you, failed, are parked or wait, in
 * that order, each only while above 0. Merged cards get none: the count says it.
 */
export function columnChips(cards: readonly PlacedCard[]): { pill: ChipPill; count: number }[] {
  return CHIP_PILLS.map(pill => ({
    pill,
    count: cards.filter(placed => placed.card.pill === pill).length,
  })).filter(chip => chip.count > 0);
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
  columns: readonly { id: string; label: string }[],
  visible: ReadonlySet<string>
): string | null {
  const hidden = columns.filter(column => !visible.has(column.id)).map(column => column.label);
  return hidden.length === 0 ? null : `Scroll for: ${hidden.join(', ')}`;
}

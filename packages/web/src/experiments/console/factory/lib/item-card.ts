/**
 * What a board card shows of an item beyond its standing: its title, the step running now,
 * its check rounds, how often it was sent back and why, its pull request, and its open asks
 * with the option the newest one recommends. Composed here, in the web, from generic reads:
 * the item read, run records, the forge's answers, the attention list's asks, and the pack's
 * factory view for every name and word. The engine knows none of these words.
 *
 * The board furniture builds on `cardProgress` and `CardProgress`: keep them stable.
 */
import type { ItemRead } from '../../skills/items';
import type { ItemAsk } from '../../primitives/run';
import type { FactoryView, ForgeSubjects, RunRecord } from '../api';
import { displayItemKey, issueNumber } from '../../lib/item-key';
import { listOf, runFacts, type RoundVerdict, type RunFacts, type RunRounds } from './run-facts';

type ItemRun = ItemRead['runs'][number];

const byStart = (a: ItemRun, b: ItemRun): number =>
  Date.parse(a.startedAt) - Date.parse(b.startedAt);
export type PackGraphStage = { name: string; workflow: string };

/** The pack the board reads an item under: its graph's stages and its view, when it ships one. */
export interface CardPack {
  stages: readonly PackGraphStage[];
  view: FactoryView | null;
}

export interface CardProgress {
  /** The issue's title, the item's own, or its readable key when neither is known. */
  title: string;
  /** Whether `title` is the readable key, so the card does not print it twice. */
  titleIsKey: boolean;
  /** The item's key as a person reads it: `#123`, `#199 · board furniture`. */
  keyText: string;
  /** The newest running run's stage and step, in the view's words. */
  running: { stage: string; step: string | null } | null;
  round: { dots: { iteration: number; verdict: RoundVerdict }[]; text: string } | null;
  returned: { count: number; text: string; reason: string | null } | null;
  /** The pull request, with the run that named it (null for the merge the item recorded). */
  pr: { url: string; number: number | null; run: string | null } | null;
  /** The open asks: the newest one's question and recommended option, and how many there are. */
  asks: { count: number; question: string; recommended: { label: string } | 'none' } | null;
  /** A run record the card needs could not be read: its rounds and returns are unknown. */
  unread: boolean;
}

/** What was read for a list of cards, keyed for lookup. */
export interface CardReads {
  /** Records by run id; a run asked for and not here could not be read. */
  records: ReadonlyMap<string, RunRecord>;
  /** Run ids the records read was asked for. */
  asked: ReadonlySet<string>;
  forge: ForgeSubjects | null;
}

/**
 * The view workflow a run is: the graph stage whose `name` the run recorded, or, for a run of
 * a retired workflow, `<the graph's stage name prefix><retired>`. Structural names, never prose.
 */
export function viewWorkflow(
  pack: CardPack,
  run: Pick<ItemRun, 'workflow' | 'pack'>
): string | null {
  if (run.pack !== null) return run.pack.workflow;
  const stage = pack.stages.find(entry => entry.name === run.workflow);
  if (stage !== undefined) return stage.workflow;
  for (const retired of pack.view?.retired ?? [])
    for (const entry of pack.stages)
      if (entry.name.endsWith(`:${entry.workflow}`)) {
        const prefix = entry.name.slice(0, entry.name.length - entry.workflow.length);
        if (run.workflow === `${prefix}${retired}`) return retired;
      }
  return null;
}

/**
 * The pack an item is read under: the one the engine says it stands at, else the newest run's
 * recorded pack, else the pack whose graph (or retired workflows) a run's workflow name
 * belongs to. Null when none of `packs` does.
 */
export function packOf(packs: ReadonlyMap<string, CardPack>, read: ItemRead): CardPack | null {
  const standing = read.standing.pack === null ? undefined : packs.get(read.standing.pack);
  if (standing !== undefined) return standing;
  for (const run of [...read.runs].sort(byStart).reverse()) {
    if (run.pack !== null) {
      const recorded = packs.get(run.pack.key);
      if (recorded !== undefined) return recorded;
      continue;
    }
    for (const pack of packs.values()) if (viewWorkflow(pack, run) !== null) return pack;
  }
  return null;
}

/** The workflows whose runs' records the card reads: every one the view's progress names. */
export function declaredWorkflows(view: FactoryView): Set<string> {
  return new Set([
    ...listOf(view.rounds).map(s => s.workflow),
    ...(view.returns ?? []).map(p => p.workflow),
    ...(view.approves ?? []).map(p => p.workflow),
    ...listOf(view.change).map(s => s.workflow),
  ]);
}

/** The runs of `read` whose records a card needs: declared workflows' runs, and running runs. */
export function runsToRead(pack: CardPack, read: ItemRead): string[] {
  if (pack.view === null) return [];
  const declared = declaredWorkflows(pack.view);
  return read.runs
    .filter(run => run.status === 'running' || declared.has(viewWorkflow(pack, run) ?? ''))
    .map(run => run.id);
}

/** The top-level result keys the view's pointers start with: all a records read keeps. */
export function resultKeys(view: FactoryView): string[] {
  const top = (pointer: string): string =>
    (pointer.split('/')[1] ?? '').replaceAll('~1', '/').replaceAll('~0', '~');
  return [
    ...new Set([
      ...listOf(view.rounds).flatMap(s => ('round' in s ? [top(s.round), top(s.allowance)] : [])),
      ...listOf(view.change).map(s => top(s.pointer)),
    ]),
  ];
}

/** The node output fields run facts read. */
export const OUTPUT_KEYS = ['outcome', 'summary'] as const;

/** The work order an item is part of: the key its active `part_of` link points at. */
function orderKey(read: ItemRead): string | null {
  return (
    read.links.find(
      link => link.kind === 'part_of' && link.direction === 'outgoing' && link.ended === null
    )?.other.key ?? null
  );
}

/** An undeclared step id made readable: loop prefixes dropped, a doubled include collapsed. */
function cleanedId(stepId: string): string {
  const step = stepId.split('.').at(-1) ?? '';
  const parts = step
    .split('__')
    .filter((part, index, all) => part !== '' && part !== all[index - 1])
    .map(part => part.replace(/[_-]+/g, ' ').trim())
    .filter(part => part !== '');
  return parts.length === 0 ? stepId : parts.join(': ');
}

/**
 * The item's rounds: the newest run that recorded one gives its source. A loop-form run's
 * rounds are its own; a stage-form source's rounds run across its runs, newest back while each
 * older round is numbered below the one after it (the rounds since the item was last planned).
 */
function itemRound(
  view: FactoryView,
  runs: readonly { run: ItemRun; workflow: string | null; facts: RunFacts }[]
): { rounds: RunRounds; running: boolean } | null {
  const newestFirst = [...runs].reverse();
  const recorded = newestFirst.find(entry => (entry.facts.rounds?.rounds.length ?? 0) > 0);
  if (recorded?.facts.rounds == null) return null;
  const source = listOf(view.rounds).find(s => s.workflow === recorded.workflow);
  if (source === undefined || 'loop' in source)
    return { rounds: recorded.facts.rounds, running: false };
  const taken: { iteration: number; verdict: RoundVerdict; max: number | null }[] = [];
  for (const entry of newestFirst) {
    if (entry.workflow !== recorded.workflow) continue;
    const round = entry.facts.rounds?.rounds.at(-1);
    if (round === undefined) continue;
    const after = taken.at(-1);
    if (after !== undefined && round.iteration >= after.iteration) break;
    taken.push({ ...round, max: entry.facts.rounds?.max ?? null });
  }
  taken.reverse();
  // A stage-form run still going is the next round, which its result has not numbered yet.
  const newest = newestFirst[0];
  const running =
    newest !== undefined &&
    newest.workflow === recorded.workflow &&
    newest.run.status === 'running';
  return {
    rounds: {
      max: taken.at(-1)?.max ?? null,
      rounds: taken.map(({ iteration, verdict }) => ({ iteration, verdict })),
    },
    running,
  };
}

function roundField(view: FactoryView, found: ReturnType<typeof itemRound>): CardProgress['round'] {
  if (found === null) return null;
  const dots = [...found.rounds.rounds];
  const last = dots.at(-1);
  if (found.running && last !== undefined)
    dots.push({ iteration: last.iteration + 1, verdict: 'running' });
  const shown = dots.at(-1)?.iteration ?? 0;
  const words = view.words?.rounds ?? 'rounds';
  const max = found.rounds.max;
  return {
    dots,
    text:
      max === null ? `${String(shown)} ${words}` : `${String(shown)} of ${String(max)} ${words}`,
  };
}

/**
 * An option id in words, for an option that declares no label (Visual standard, rule 8):
 * `send-back` reads "Send back"; the reserved `other` reads "Something else".
 */
function humaniseId(id: string): string {
  if (id === 'other') return 'Something else';
  const words = id.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The item's open asks, newest first. An item ask records no time of its own, so it is as new
 * as the run that asked it (`askedIn`), by that run's start in the item read; an ask whose run
 * is not among the item's runs comes last, in the list's order.
 */
export function newestFirst(read: ItemRead, asks: readonly ItemAsk[]): ItemAsk[] {
  const started = new Map(read.runs.map(run => [run.id, Date.parse(run.startedAt)]));
  const at = (ask: ItemAsk): number =>
    (ask.askedIn === undefined ? undefined : started.get(ask.askedIn.runId)) ?? -Infinity;
  return [...asks].sort((a, b) => at(b) - at(a));
}

/** The asks open on the item, and what the newest one recommends by its option's label. */
function asksField(read: ItemRead, asks: readonly ItemAsk[]): CardProgress['asks'] {
  const [first] = newestFirst(read, asks);
  if (first === undefined) return null;
  const chosen =
    first.recommendation === undefined
      ? undefined
      : first.options.find(option => option.id === first.recommendation?.option);
  return {
    count: asks.length,
    question: first.message,
    recommended:
      first.recommendation === undefined
        ? 'none'
        : { label: chosen?.label ?? humaniseId(first.recommendation.option) },
  };
}

function titleOf(read: ItemRead, forge: ForgeSubjects | null, keyText: string): string | null {
  const own = read.item.title?.trim();
  if (own !== undefined && own !== '') return own;
  const number = issueNumber(read.item.key);
  if (number === null) return null;
  const issue = forge?.issues.find(entry => String(entry.number) === number);
  const title = issue?.title?.trim();
  return title === undefined || title === '' || title === keyText ? null : title;
}

/** The pull request: the newest declared run's named change, else the merge the item recorded. */
function prOf(
  read: ItemRead,
  runs: readonly { run: ItemRun; facts: RunFacts }[],
  forge: ForgeSubjects | null
): CardProgress['pr'] {
  const named = [...runs].reverse().find(entry => entry.facts.change !== null);
  const url = named?.facts.change ?? read.merged?.change ?? null;
  if (url === null) return null;
  const run = named === undefined ? null : named.run.id;
  const answer = forge?.changes.find(change => change.run === run && change.url === url);
  return { url, number: answer?.number ?? null, run };
}

type ReadRun = { run: ItemRun; workflow: string | null; facts: RunFacts };

/** The item's runs whose records were read, in start order, with their facts. */
function readRuns(read: ItemRead, pack: CardPack | null, reads: CardReads): ReadRun[] {
  const view = pack?.view ?? null;
  if (pack === null || view === null) return [];
  return [...read.runs].sort(byStart).flatMap(run => {
    const record = reads.records.get(run.id);
    if (record === undefined) return [];
    const workflow = viewWorkflow(pack, run);
    return [{ run, workflow, facts: runFacts(view, workflow, run, record) }];
  });
}

/** The newest running run's stage and step, in the view's words when it has them. */
function runningField(view: FactoryView | null, runs: readonly ReadRun[]): CardProgress['running'] {
  const running = [...runs].reverse().find(entry => entry.run.status === 'running');
  if (running === undefined) return null;
  const words = running.workflow === null ? undefined : view?.stages[running.workflow];
  const step = running.facts.active;
  return {
    stage: words?.label ?? running.workflow ?? running.run.workflow,
    step: step === null ? null : (words?.steps?.[step] ?? cleanedId(step)),
  };
}

function returnedField(view: FactoryView, runs: readonly ReadRun[]): CardProgress['returned'] {
  const returns = runs.flatMap(entry => entry.facts.returns);
  if (returns.length === 0) return null;
  return {
    count: returns.length,
    text: `${view.words?.sentBack ?? 'sent back'} ${String(returns.length)}x`,
    reason: returns.at(-1)?.summary ?? null,
  };
}

/** The card's progress for one item. `pack` null: the item stands at no pack the board read. */
export function cardProgress(
  read: ItemRead,
  pack: CardPack | null,
  reads: CardReads,
  asks: readonly ItemAsk[]
): CardProgress {
  const keyText = displayItemKey(read.item.key, orderKey(read));
  const title = titleOf(read, reads.forge, keyText);
  const view = pack?.view ?? null;
  const wanted = pack === null ? [] : runsToRead(pack, read);
  const unread = wanted.some(id => reads.asked.has(id) && !reads.records.has(id));
  const runs = readRuns(read, pack, reads);
  const declared = view === null ? new Set<string>() : declaredWorkflows(view);
  const progressRuns = runs.filter(entry => declared.has(entry.workflow ?? ''));
  const counted = view !== null && !unread;
  return {
    title: title ?? keyText,
    titleIsKey: title === null,
    keyText,
    running: runningField(view, runs),
    round: counted ? roundField(view, itemRound(view, progressRuns)) : null,
    returned: counted ? returnedField(view, progressRuns) : null,
    pr: prOf(read, progressRuns, reads.forge),
    asks: asksField(read, asks),
    unread,
  };
}

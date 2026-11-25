/**
 * What board cards read beyond the item read, shared by every card list of a board: each of the
 * project's packs' graph and factory view, the project's open asks by item, and which item's
 * asks are open in the popover. A card list reads the run records and forge answers its own
 * cards need in batches (`useCardList`). With no provider (a test drawing a pack board alone)
 * cards show what the item read alone gives.
 */
import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { ItemAsks } from '../components/ItemAsksSection';
import { getPackGraph, type ItemRead } from '../skills/items';
import { useEntity } from '../store/cache';
import { K } from '../store/keys';
import {
  getForgeSubjects,
  getPackView,
  getRunRecords,
  type ForgeSubjects,
  type RunRecord,
  type RunRecords,
} from './api';
import { CardsContext, useFactoryCards, type FactoryCards, type OpenAsks } from './cards-context';
import { ItemAsksPopover } from './ItemAsksPopover';
import { issueNumber } from '../lib/item-key';
import {
  cardProgress,
  OUTPUT_KEYS,
  packOf,
  resultKeys,
  runsToRead,
  type CardPack,
  type CardProgress,
} from './lib/item-card';

async function readPacks(projectId: string, packs: readonly string[]) {
  const read = await Promise.all(
    packs.map(async pack => {
      const [graph, view] = await Promise.all([
        getPackGraph(projectId, pack),
        getPackView(projectId, pack),
      ]);
      return [pack, { stages: graph.stages, view }] as const;
    })
  );
  return new Map<string, CardPack>(read);
}

export function FactoryCardsProvider({
  projectId,
  packs,
  itemAsks,
  children,
}: {
  projectId: string;
  packs: readonly string[];
  itemAsks: ItemAsks;
  children: ReactNode;
}): ReactElement {
  const read = useEntity(K.packViews(projectId, packs), () => readPacks(projectId, packs));
  const [open, setOpen] = useState<OpenAsks | null>(null);
  const value: FactoryCards = {
    projectId,
    packs: read.data ?? null,
    packsError: read.error !== undefined,
    itemAsks,
    open,
    setOpen,
  };
  return (
    <CardsContext.Provider value={value}>
      {children}
      <ItemAsksPopover />
    </CardsContext.Provider>
  );
}

/** The issue an item's key names whose title the card needs: none when the item has its own. */
function titleIssue(read: ItemRead): number[] {
  const number = issueNumber(read.item.key);
  return number === null || (read.item.title ?? '').trim() !== '' ? [] : [Number(number)];
}

/** What one card list reads: its cards' runs to read and the result keys their pointers name. */
function recordsAsk(packs: ReadonlyMap<string, CardPack>, reads: readonly ItemRead[]) {
  const runs = new Set<string>();
  const result = new Set<string>();
  for (const read of reads) {
    const pack = packOf(packs, read);
    for (const id of pack === null ? [] : runsToRead(pack, read)) runs.add(id);
    for (const key of pack?.view == null ? [] : resultKeys(pack.view)) result.add(key);
  }
  return { runs: [...runs].sort(), result: [...result] };
}

/** An entity's newest answer, or the last one while a changed key reads again. */
function useHeld<T>(data: T | null | undefined): T | null {
  const held = useRef<T | null>(null);
  if (data != null) held.current = data;
  return data ?? held.current;
}

/**
 * A forge read that fails leaves what it would have named unknown (titles, PR numbers) and the
 * rest of the card as read. The error goes to the console: the card still shows its key.
 */
async function forgeOrNull(
  query: Parameters<typeof getForgeSubjects>[0]
): Promise<ForgeSubjects | null> {
  try {
    return await getForgeSubjects(query);
  } catch (error) {
    console.warn('Board cards: the forge could not be read', error);
    return null;
  }
}

/**
 * The issue titles the forge names for `reads` whose title column is empty: what a card prints
 * as its title, and what the board's filter searches (`itemMatches`). Read apart from the run
 * records and the pack reads, so titles show as soon as the forge answers.
 */
export function useForgeTitles(
  projectId: string | null,
  reads: readonly ItemRead[]
): ForgeSubjects['issues'] | null {
  const issues = [...new Set(reads.flatMap(titleIssue))].sort((a, b) => a - b);
  const enabled = projectId !== null && issues.length > 0;
  const read = useEntity<ForgeSubjects | null>(
    enabled ? K.forgeTitles(projectId, issues) : 'forge-titles:none',
    () =>
      enabled ? forgeOrNull({ codebaseId: projectId, issues, changes: [] }) : Promise.resolve(null)
  );
  return useHeld(read.data)?.issues ?? null;
}

/**
 * The run records a list's cards need. While a changed list (a filter, "Show more", a run
 * starting) reads again, its last answer stays drawn: records are by run, so the held ones stay
 * true, and a run the held read was not asked for is not taken as unreadable.
 */
function useListRecords(
  projectId: string | null,
  ask: ReturnType<typeof recordsAsk>
): { records: ReadonlyMap<string, RunRecord>; asked: ReadonlySet<string> } {
  const enabled = projectId !== null && ask.runs.length > 0;
  const read = useEntity<RunRecords | null>(
    enabled ? K.cardReads(projectId, ask.runs) : 'factory-cards:none',
    () =>
      enabled
        ? getRunRecords(ask.runs, { output: OUTPUT_KEYS, result: ask.result })
        : Promise.resolve(null)
  );
  const held = useRef<{ data: RunRecords; runs: readonly string[] } | null>(null);
  if (read.data != null) held.current = { data: read.data, runs: ask.runs };
  const shown = read.data ?? held.current?.data ?? null;
  return {
    records: new Map((shown?.records ?? []).map(record => [record.id, record])),
    asked: new Set(
      read.data != null || read.error !== undefined ? ask.runs : (held.current?.runs ?? [])
    ),
  };
}

/** The forge's pull request numbers for the changes runs named, read once the records answer. */
function useForgeChanges(
  projectId: string | null,
  changes: readonly { run: string; url: string }[]
): ForgeSubjects['changes'] | null {
  const enabled = projectId !== null && changes.length > 0;
  const read = useEntity<ForgeSubjects | null>(
    enabled ? K.forgeChanges(projectId, changes) : 'forge-changes:none',
    () =>
      enabled ? forgeOrNull({ codebaseId: projectId, issues: [], changes }) : Promise.resolve(null)
  );
  return useHeld(read.data)?.changes ?? null;
}

/**
 * Each card's progress for a list of cards. Three reads, each drawn as soon as it answers: the
 * issue titles, the run records (rounds, returns, the running step, the PR), and then the
 * forge's numbers for the PRs those records name. Before they answer, and with no provider, a
 * card shows what its item read alone gives.
 */
export function useCardList(reads: readonly ItemRead[]): (read: ItemRead) => CardProgress {
  const cards = useFactoryCards();
  const projectId = cards?.projectId ?? null;
  const packs = cards?.packs ?? new Map<string, CardPack>();
  const issues = useForgeTitles(projectId, reads);
  const { records, asked } = useListRecords(
    cards?.packs == null ? null : projectId,
    recordsAsk(packs, reads)
  );
  const progressOf = (read: ItemRead, forge: ForgeSubjects | null): CardProgress => {
    const answered = new Set(cards?.itemAsks?.answered.map(record => record.ask.ref) ?? []);
    const asks = (cards?.itemAsks?.asks ?? []).filter(
      entry => entry.item?.id === read.item.id && !answered.has(entry.ref)
    );
    const progress = cardProgress(read, packOf(packs, read), { records, asked, forge }, asks);
    return cards?.packsError === true ? { ...progress, unread: true } : progress;
  };
  const changes = reads.flatMap(read => {
    const pr = progressOf(read, null).pr;
    return pr?.run == null ? [] : [{ run: pr.run, url: pr.url }];
  });
  const numbers = useForgeChanges(projectId, changes);
  const forge = { issues: issues ?? [], changes: numbers ?? [] };
  return read => progressOf(read, forge);
}

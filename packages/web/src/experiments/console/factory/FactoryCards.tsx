/**
 * What board cards read beyond the item read, shared by every card list of a board: each of the
 * project's packs' graph and factory view, the project's open asks by item, and which item's
 * asks are open in the popover. A card list reads the run records and forge answers its own
 * cards need in one batch (`useCardList`). With no provider (a pack board drawn alone) cards
 * show what the item read alone gives.
 */
import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { ItemAsks } from '../components/ItemAsksSection';
import type { ItemAsk } from '../primitives/run';
import { getPackGraph, type ItemRead } from '../skills/items';
import { useEntity } from '../store/cache';
import { K } from '../store/keys';
import {
  getForgeSubjects,
  getPackView,
  getRunRecords,
  type ForgeSubjects,
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

/** What one card list reads: its cards' runs to read, and the issues whose titles it needs. */
/** The issue an item's key names whose title the card needs: none when the item has its own. */
function titleIssue(read: ItemRead): number[] {
  const number = issueNumber(read.item.key);
  return number === null || (read.item.title ?? '').trim() !== '' ? [] : [Number(number)];
}

function askOf(packs: ReadonlyMap<string, CardPack>, reads: readonly ItemRead[]) {
  const runs = new Set<string>();
  const result = new Set<string>();
  for (const read of reads) {
    const pack = packOf(packs, read);
    for (const id of pack === null ? [] : runsToRead(pack, read)) runs.add(id);
    for (const key of pack?.view == null ? [] : resultKeys(pack.view)) result.add(key);
  }
  const issues = [...new Set(reads.flatMap(titleIssue))].sort((a, b) => a - b);
  return { runs: [...runs].sort(), issues, result: [...result] };
}

interface ListReads {
  records: RunRecords;
  /** Null when the forge could not be read: cards then read their keys, not issue titles. */
  forge: ForgeSubjects | null;
}

/**
 * Records, then the forge for the issues' titles and the changes the records name at their
 * declared pointers. A forge that cannot be read leaves titles and PR numbers unknown and the
 * rest of the card as read; its error goes to the console, since the card still shows the key.
 */
async function readList(
  projectId: string,
  packs: ReadonlyMap<string, CardPack>,
  reads: readonly ItemRead[],
  ask: ReturnType<typeof askOf>
): Promise<ListReads> {
  const records =
    ask.runs.length === 0
      ? { records: [], missing: [], unreadable: [] }
      : await getRunRecords(ask.runs, { output: OUTPUT_KEYS, result: ask.result });
  const known = {
    records: new Map(records.records.map(record => [record.id, record])),
    asked: new Set(ask.runs),
    forge: null,
  };
  const changes = reads.flatMap(read => {
    const pr = cardProgress(read, packOf(packs, read), known, []).pr;
    return pr?.run == null ? [] : [{ run: pr.run, url: pr.url }];
  });
  if (ask.issues.length === 0 && changes.length === 0) return { records, forge: null };
  try {
    return {
      records,
      forge: await getForgeSubjects({ codebaseId: projectId, issues: ask.issues, changes }),
    };
  } catch (error) {
    console.warn('Board cards: the forge could not be read', error);
    return { records, forge: null };
  }
}

/**
 * Each card's progress for a list of cards, read in one batch. Before the reads answer, and
 * with no provider, a card shows what its item read alone gives.
 */
export function useCardList(reads: readonly ItemRead[]): (read: ItemRead) => CardProgress {
  const cards = useFactoryCards();
  const packs = cards?.packs ?? new Map<string, CardPack>();
  const ask = askOf(packs, reads);
  const askKey = `${ask.runs.join(',')}|${ask.issues.join(',')}`;
  const enabled = cards !== null && cards.packs !== null && askKey !== '|';
  const list = useEntity<ListReads | null>(
    enabled ? K.cardReads(cards.projectId, askKey) : 'factory-cards:none',
    () => (enabled ? readList(cards.projectId, packs, reads, ask) : Promise.resolve(null))
  );
  // While a changed list (a filter, "Show more", a run starting) reads again, its last answer
  // stays drawn: records and forge answers are by run and issue, so the held ones stay true,
  // and a run the held read was not asked for is not taken as unreadable.
  const held = useRef<{ data: ListReads; runs: readonly string[] } | null>(null);
  if (list.data != null) held.current = { data: list.data, runs: ask.runs };
  const shown = list.data ?? held.current?.data ?? null;
  const records = new Map((shown?.records.records ?? []).map(record => [record.id, record]));
  const asked = new Set(
    list.data != null || list.error !== undefined ? ask.runs : (held.current?.runs ?? [])
  );
  const asksOf = (read: ItemRead): ItemAsk[] => {
    const answered = new Set(cards?.itemAsks?.answered.map(record => record.ask.ref) ?? []);
    return (cards?.itemAsks?.asks ?? []).filter(
      entry => entry.item?.id === read.item.id && !answered.has(entry.ref)
    );
  };
  return read => {
    const progress = cardProgress(
      read,
      packOf(packs, read),
      { records, asked, forge: shown?.forge ?? null },
      asksOf(read)
    );
    return cards?.packsError === true ? { ...progress, unread: true } : progress;
  };
}

import { useCallback, useMemo, useState } from 'react';
import {
  askGroupKey,
  NO_ITEM_ASKS,
  type AnsweredAsk,
  type ItemAsks,
} from '../components/ItemAsksSection';
import type { ItemAsk, Run } from '../primitives/run';
import { listRunsNeedingAttention, type RunsAttention } from '../skills/runs';
import { invalidate, useEntity, type EntityView } from '../store/cache';
import { K } from '../store/keys';
import type { FactoryItem } from './api';
import { FK } from './keys';
import { isRefAsk, itemOpenEntries, type OpenEntry } from './lib/attention';

/** An item's open entry that Archon's ask section does not answer by ref, with its run when held. */
export interface HeldEntry {
  entry: OpenEntry;
  /** The paused run holding the wait, from the attention read; undefined when it is not there. */
  run: Run | undefined;
}

type AskSubject = Pick<FactoryItem, 'item' | 'questions'>;

/** The factory's asks, from Archon's own attention read, and the answers given on this page. */
export interface FactoryAsks {
  /** Archon's attention read, the one Runs reads; its asks and runs are not yet scoped. */
  read: EntityView<RunsAttention>;
  /** The project's asks no run holds (Archon's `ItemAsk`), empty until the read loads. */
  asks: ItemAsk[];
  /** What waits on the item and was not answered on this page, newest first. */
  entriesOf: (item: AskSubject) => OpenEntry[];
  /** The props of Archon's `ItemAsksSection` for the whole page: every answer given on it, no asks. */
  section: ItemAsks;
  /** The props of Archon's `ItemAsksSection` for the item: its asks answered by ref. */
  sectionOf: (item: AskSubject) => ItemAsks;
  /** The item's other entries: paused runs' waits and gates, and runs the factory cannot answer. */
  heldOf: (item: AskSubject) => HeldEntry[];
}

/**
 * The asks of one project's items, for the board, the item page and the Overview. They come
 * from Archon's attention read (`K.runsAttention`, as the Runs page reads it) scoped to the
 * project, joined with each item read's own questions, and are answered through Archon's ask
 * section. The page that calls this owns the answers given on it, as the Runs page does, so an
 * answered ask shows as answered until its item is dismissed.
 */
export function useItemAsks(projectId: string): FactoryAsks {
  const read = useEntity<RunsAttention>(K.runsAttention, listRunsNeedingAttention);
  const [answered, setAnswered] = useState<AnsweredAsk[]>([]);
  const data = read.data;
  const asks = useMemo(
    () => (data?.asks ?? []).filter(ask => ask.project?.codebaseId === projectId),
    [data, projectId]
  );
  const runs = useMemo(
    () =>
      new Map(
        (data?.runs ?? []).filter(run => run.projectId === projectId).map(run => [run.id, run])
      ),
    [data, projectId]
  );
  const answeredRefs = useMemo(() => new Set(answered.map(record => record.ask.ref)), [answered]);
  const entriesOf = useCallback(
    (item: AskSubject): OpenEntry[] =>
      itemOpenEntries(item, asks).filter(entry => !answeredRefs.has(entry.ref)),
    [asks, answeredRefs]
  );
  const onAnswered = useCallback(
    (record: AnsweredAsk): void => {
      setAnswered(prev => [...prev.filter(r => r.ask.ref !== record.ask.ref), record]);
      // Archon's section refreshes its own read; the item reads list the ask among their
      // questions until they are read again, and the card's count and placement follow them.
      invalidate(FK.factoryItems(projectId));
    },
    [projectId]
  );
  const onDismissItem = useCallback((groupKey: string): void => {
    setAnswered(prev => prev.filter(record => askGroupKey(record.ask) !== groupKey));
  }, []);
  const section: ItemAsks = {
    asks: [],
    answered,
    answerRefusals: data?.answerRefusals ?? NO_ITEM_ASKS.answerRefusals,
    itemIds: data?.itemIds ?? NO_ITEM_ASKS.itemIds,
    onAnswered,
    onDismissItem,
  };
  return {
    read,
    asks,
    entriesOf,
    section,
    sectionOf: item => ({
      ...section,
      // A wait in a child run names no item; the item read that lists it is the item it is on.
      asks: itemOpenEntries(item, asks)
        .filter(isRefAsk)
        .map(ask => (ask.item === undefined ? { ...ask, item: item.item } : ask)),
      answered: answered.filter(record => record.ask.item?.id === item.item.id),
    }),
    heldOf: item =>
      entriesOf(item)
        .filter(entry => !isRefAsk(entry))
        .map(entry => ({
          entry,
          run: 'run' in entry && entry.run !== undefined ? runs.get(entry.run.id) : undefined,
        })),
  };
}

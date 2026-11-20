import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { AskGroup } from '../components/ask-card/AskGroup';
import { useAnsweredHold } from '../components/ask-card/useAnsweredHold';
import { CircleCheck } from 'lucide-react';
import { EmptyNote } from '../components/EmptyNote';
import { SkeletonBlock, SkeletonGroup, SkeletonLine } from '../components/Skeleton';
import { askNaming } from '../lib/ask-naming';
import { errorDetail } from '../lib/http';
import * as skill from '../skills';
import type { FactoryItem, FactoryItemDetail } from '../skills/factory';
import type { AttentionQueue } from '../skills/runs';
import type { EntityView } from '../store/cache';
import { K } from '../store/keys';
import { useFactoryRead } from './useFactoryRead';
import { readFailed } from './lib/deadline';
import { BackLink } from './BackLink';
import { FactoryFrame } from './FactoryFrame';
import { ItemHeader } from './ItemHeader';
import { ItemAnswers, ItemLinks } from './ItemRecords';
import { isNoSuchItem, useWorkOrders, WorkOrderOnly } from './ItemWorkOrder';
import { ItemTimeline, SectionTitle } from './ItemTimeline';
import { itemPill } from './lib/board';
import { mergePending } from './lib/merge-pending';
import { itemAsks, type NeedsYouItem } from '../lib/needs-you';
import { itemColumn, placementInput, stageIdOf } from './lib/placement';
import { buildTimeline, timelineMerged } from './lib/timeline';
import { membershipOf } from './lib/work-orders';
import { factoryPath, type FactoryViewListed } from './lib/views';
import { scheduleReread } from './merge-reread';
import { FactoryLoading } from './FactoryLoading';
import { ItemNotFound } from './ItemMissing';
import { readFailure } from './lib/read-failure';
import { ReadFailure } from './ReadFailure';
import { useReadRetry } from './useReadRetry';

/** `/console/p/:projectId/factory/items/:key`: one item, all of it. */
export function ItemPage(): ReactElement {
  return (
    <FactoryFrame section={null}>
      {(view, attention) => <ItemBody view={view} attention={attention} />}
    </FactoryFrame>
  );
}

function ItemBody({
  view,
  attention,
}: {
  view: FactoryViewListed;
  attention: EntityView<AttentionQueue>;
}): ReactElement {
  const { projectId = '', key = '' } = useParams<{ projectId: string; key: string }>();
  // Under the `factory-items` prefix, so the dashboard SSE refreshes it on every run event.
  const itemKey = K.factoryItem(projectId, key);
  const read = useFactoryRead<FactoryItemDetail>(itemKey, within =>
    within(signal => skill.getFactoryItem({ codebaseId: projectId, key }, { signal }))
  );
  // As `useFactoryItems`: read again while the server is still asking whether it merged.
  const { data, error } = read;
  useEffect(() => {
    if (data !== undefined && mergePending(data.item)) scheduleReread(itemKey);
  }, [data, error, itemKey]);
  return (
    <div className="flex flex-col gap-6">
      <BackLink to={factoryPath(projectId)} label="Back to the overview" />
      <ItemRead view={view} projectId={projectId} itemKey={key} read={read} attention={attention} />
    </div>
  );
}

function ItemRead({
  view,
  projectId,
  itemKey,
  read,
  attention,
}: {
  view: FactoryViewListed;
  projectId: string;
  itemKey: string;
  read: EntityView<FactoryItemDetail>;
  attention: EntityView<AttentionQueue>;
}): ReactNode {
  const { data } = read;
  const orders = useWorkOrders(
    view.declaration,
    projectId,
    data === undefined ? undefined : { key: itemKey, members: incomingMembers(data.item) }
  );
  const order = orders.orders?.find(entry => entry.key === itemKey);
  // The stage the item sat in on the last read: a run on a step no stage names stays there,
  // as on the board and the map.
  const previous = useRef<{ key: string; stage: string | undefined } | null>(null);
  const column =
    data === undefined
      ? undefined
      : itemColumn(
          view.declaration,
          placementInput(data.item, new Map(data.runs.map(run => [run.runId, run]))),
          previous.current?.key === itemKey ? previous.current.stage : undefined
        );
  useEffect(() => {
    if (column !== undefined) previous.current = { key: itemKey, stage: stageIdOf(column) };
  }, [column, itemKey]);
  if (data === undefined)
    return (
      <ItemUnread
        key={itemKey}
        projectId={projectId}
        itemKey={itemKey}
        read={read}
        orders={orders}
      />
    );
  const asks = itemAsks(data.item, attention.data?.items ?? []);
  const declaration = view.declaration;
  // The placement every view shares, and the board's pill, so the header says what the
  // item's card says.
  const landed = stageIdOf(column ?? null) === declaration.landed.stage;
  return (
    <>
      <ItemHeader
        item={data.item}
        pill={itemPill(declaration, data.item, landed).pill}
        column={column ?? null}
        workOrder={
          data.item.runs.length === 0 &&
          (order !== undefined || incomingMembers(data.item).length > 0)
        }
      />
      <ItemAsks projectId={projectId} view={view} asks={asks} attention={attention} />
      <ItemTimeline
        rows={buildTimeline(declaration, projectId, data, Date.now())}
        merged={timelineMerged(data)}
      />
      <ItemLinks
        projectId={projectId}
        links={data.item.links}
        membership={membershipOf(data.item)}
        order={order}
      />
      <ItemAnswers projectId={projectId} answers={data.item.answers} />
      <Degraded degraded={data.item.degraded} />
    </>
  );
}

/** The keys of the items an active `part_of` link joins to this one: its members, by its own read. */
function incomingMembers(item: FactoryItemDetail['item']): string[] {
  return item.links
    .filter(link => link.kind === 'part_of' && link.direction === 'incoming' && link.ended === null)
    .map(link => link.other.key);
}

/**
 * The page while the item read has no value: loading, why it failed with a Retry, or that there
 * is no such item. Keyed by the item, so a held failure of another key is never shown.
 */
function ItemUnread({
  projectId,
  itemKey,
  read,
  orders,
}: {
  projectId: string;
  itemKey: string;
  read: EntityView<FactoryItemDetail>;
  orders: ReturnType<typeof useWorkOrders>;
}): ReactElement {
  const { failed, retry } = useReadRetry(read);
  if (isNoSuchItem(failed))
    return <NoSuchItem projectId={projectId} itemKey={itemKey} read={read} orders={orders} />;
  if (failed !== undefined)
    return (
      <ReadFailure retry={retry}>
        Item <span className="font-mono">{itemKey}</span> could not be read: {readFailure(failed)}
      </ReadFailure>
    );
  return <ItemSkeleton read={read} />;
}

/**
 * The item read answered 404. A work order only a member's order run named has no item row, so
 * the page is the order's, from the items read. Until that read lands the page cannot say there
 * is no item, and if it failed, it says the item could not be checked, with a Retry.
 */
function NoSuchItem({
  projectId,
  itemKey,
  read,
  orders,
}: {
  projectId: string;
  itemKey: string;
  read: EntityView<FactoryItemDetail>;
  orders: ReturnType<typeof useWorkOrders>;
}): ReactElement {
  if (orders.orders === undefined)
    return orders.failed === undefined ? (
      <ItemSkeleton read={read} />
    ) : (
      <ReadFailure retry={orders.retry}>
        Item <span className="font-mono">{itemKey}</span> could not be checked: the items could not
        be read to look for it: {readFailure(orders.failed)}
      </ReadFailure>
    );
  const order = orders.orders.find(entry => entry.key === itemKey);
  if (order !== undefined) return <WorkOrderOnly projectId={projectId} order={order} />;
  return <ItemNotFound projectId={projectId} itemKey={itemKey} />;
}

/** The item page's shape while it loads (rule 6): the header's lines and pill, three runs. */
function ItemSkeleton({ read }: { read: EntityView<FactoryItemDetail> }): ReactElement {
  return (
    <FactoryLoading read={read}>
      <SkeletonGroup label="Loading the item" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <SkeletonLine width="short" />
          <SkeletonLine />
          <SkeletonBlock height="h-6" />
        </div>
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map(index => (
            <SkeletonBlock key={index} height="h-16" />
          ))}
        </div>
      </SkeletonGroup>
    </FactoryLoading>
  );
}

/** The item's open asks, each as the ask card Needs you draws, always open; the page names the item. */
function ItemAsks({
  projectId,
  view,
  asks,
  attention,
}: {
  projectId: string;
  view: FactoryViewListed;
  asks: NeedsYouItem[];
  attention: EntityView<AttentionQueue>;
}): ReactElement {
  const queue = attention.data;
  const failed = readFailed(attention.error);
  // Held here, not in the group: the item's last ask answered would otherwise unmount it.
  const hold = useAnsweredHold(asks);
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle>Asks</SectionTitle>
      {queue === undefined ? (
        failed === undefined ? (
          <FactoryLoading read={attention}>
            <SkeletonGroup label="Loading what waits on you">
              <SkeletonBlock height="h-32" rounded="rounded-console-16" />
            </SkeletonGroup>
          </FactoryLoading>
        ) : (
          <p className="text-console-13 text-text-tertiary">
            What waits on you could not be loaded: {errorDetail(failed)}
          </p>
        )
      ) : hold.asks.length === 0 ? (
        <EmptyNote icon={CircleCheck} sentence="Nothing on this item is waiting on you." />
      ) : (
        <AskGroup
          projectId={projectId}
          asks={hold.asks}
          hold={hold}
          queue={queue}
          where={askNaming(projectId, view).where}
        />
      )}
    </section>
  );
}

/** Each part of the item that could not be read, one muted line each. */
function Degraded({ degraded }: { degraded: FactoryItem['degraded'] }): ReactNode {
  if (degraded.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-console-13 text-text-tertiary">
      {degraded.map(report => (
        <li key={JSON.stringify(report)}>{degradedWords(report)}</li>
      ))}
    </ul>
  );
}

function degradedWords(report: FactoryItem['degraded'][number]): string {
  switch (report.reason) {
    case 'ruling_unreadable':
      return `A ruling (${report.rulingId}) could not be read.`;
    case 'link_unreadable':
      return `A link (${report.linkId}) could not be read.`;
    case 'merge_unreadable':
      return 'The merge record of this item could not be read.';
    default:
      return report.runId === undefined
        ? 'Part of this item could not be read.'
        : `Run ${report.runId} could not be read.`;
  }
}

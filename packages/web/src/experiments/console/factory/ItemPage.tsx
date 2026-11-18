import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { EmptyState } from '../components/EmptyState';
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
import { itemAsks, type NeedsYouItem } from './lib/needs-you';
import { itemColumn, placementInput, stageIdOf } from './lib/placement';
import { buildTimeline } from './lib/timeline';
import { membershipOf } from './lib/work-orders';
import { factoryPath, type FactoryViewListed } from './lib/views';
import { scheduleReread } from './merge-reread';
import { NeedsYouRow } from './NeedsYouRow';
import { FactoryLoading } from './FactoryLoading';

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
    <div className="flex flex-col gap-5">
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
  const orders = useWorkOrders(view.declaration, projectId);
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
    return <ItemUnread projectId={projectId} itemKey={itemKey} read={read} orders={orders} />;
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
        workOrder={data.item.runs.length === 0 && (order !== undefined || hasMembers(data.item))}
      />
      <ItemAsks projectId={projectId} asks={asks} attention={attention} />
      <ItemTimeline rows={buildTimeline(declaration, projectId, data, Date.now())} />
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

/**
 * Whether an active `part_of` link names the item: then it is a work order, known from its own
 * read before the items read lands.
 */
function hasMembers(item: FactoryItemDetail['item']): boolean {
  return item.links.some(
    link => link.kind === 'part_of' && link.direction === 'incoming' && link.ended === null
  );
}

/**
 * The page while the item read has no value: loading, or why it failed. A work order only a
 * member's order run named has no item row, so the item read answers 404 and the page is the
 * order's, from the items read.
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
  const failed = readFailed(read.error);
  if (isNoSuchItem(failed)) {
    const order = orders.orders?.find(entry => entry.key === itemKey);
    if (order !== undefined) return <WorkOrderOnly projectId={projectId} order={order} />;
    if (orders.orders === undefined && !orders.failed) return <FactoryLoading read={read} />;
  }
  if (failed !== undefined)
    return <EmptyState title={`Item ${itemKey} could not be read`} hint={errorDetail(failed)} />;
  return <FactoryLoading read={read} />;
}

function ItemAsks({
  projectId,
  asks,
  attention,
}: {
  projectId: string;
  asks: NeedsYouItem[];
  attention: EntityView<AttentionQueue>;
}): ReactElement {
  const queue = attention.data;
  const failed = readFailed(attention.error);
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle>Asks</SectionTitle>
      {queue === undefined ? (
        failed === undefined ? (
          <FactoryLoading read={attention} />
        ) : (
          <p className="text-xs text-text-tertiary">
            What waits on you could not be loaded: {errorDetail(failed)}
          </p>
        )
      ) : asks.length === 0 ? (
        <p className="text-sm text-text-secondary">Nothing on this item is waiting on you.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {asks.map(ask => (
            <NeedsYouRow key={ask.ref} projectId={projectId} item={ask} queue={queue} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Each part of the item that could not be read, one muted line each. */
function Degraded({ degraded }: { degraded: FactoryItem['degraded'] }): ReactNode {
  if (degraded.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-console-12 text-text-tertiary">
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

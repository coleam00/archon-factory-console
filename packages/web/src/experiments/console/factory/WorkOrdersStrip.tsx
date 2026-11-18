import type { ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router';
import { statusDotClass } from '../lib/run-status';
import { itemPath, PILL_LABEL, type Pill } from './lib/board';
import { orderSearch, type WorkOrder } from './lib/work-orders';

/** A member's state as a dot, in the colour its pill has. */
const PILL_DOT_CLASS: Record<Pill, string> = {
  running: statusDotClass.running,
  'needs-you': 'bg-warning',
  failed: 'bg-error',
  waiting: 'bg-text-tertiary/60',
  landed: 'bg-success',
};

/**
 * The work orders with a member on the board, one compact row each, above the Pipeline's
 * columns: the order, how many of its members landed, each member's state, and a toggle
 * that lights its members on the board. Nothing when no item is part of an order.
 */
export function WorkOrdersStrip({
  projectId,
  orders,
  lit,
}: {
  projectId: string;
  orders: readonly WorkOrder[];
  /** The order `?order=` lights; null when none. */
  lit: string | null;
}): ReactElement | null {
  if (orders.length === 0) return null;
  return (
    <section aria-label="Work orders" className="flex flex-col gap-1.5">
      <h3 className="text-console-11 font-medium uppercase tracking-wider text-text-tertiary">
        Work orders
      </h3>
      <ul className="flex flex-col gap-1.5">
        {orders.map(order => (
          <WorkOrderRow
            key={order.key}
            projectId={projectId}
            order={order}
            lit={order.key === lit}
          />
        ))}
      </ul>
    </section>
  );
}

function WorkOrderRow({
  projectId,
  order,
  lit,
}: {
  projectId: string;
  order: WorkOrder;
  lit: boolean;
}): ReactElement {
  const [, setParams] = useSearchParams();
  const total = order.members.length;
  const landedWords = `${order.landed.toString()} of ${total.toString()} landed`;
  return (
    <li
      data-order={order.key}
      className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded border bg-surface-elevated px-2.5 py-1.5 text-console-12 ${
        lit ? 'border-accent-bright' : 'border-border'
      }`}
    >
      <Link
        to={itemPath(projectId, order.key)}
        className="font-mono text-console-11 text-accent-bright hover:underline"
      >
        {order.key}
      </Link>
      {order.title === order.key ? null : (
        <span className="min-w-0 max-w-full truncate text-text-primary">{order.title}</span>
      )}
      <span className="flex items-center gap-2 whitespace-nowrap text-text-secondary">
        {landedWords}
        <span
          role="img"
          aria-label={landedWords}
          className="relative h-1.5 w-16 overflow-hidden rounded-full bg-surface-hover"
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-success"
            style={{ width: `${total === 0 ? 0 : (order.landed / total) * 100}%` }}
          />
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-1">
        {order.members.map(member => {
          const label = `${member.key}: ${PILL_LABEL[member.pill]}`;
          return (
            <span
              key={member.key}
              role="img"
              aria-label={label}
              title={label}
              className={`inline-block h-2 w-2 rounded-full ${PILL_DOT_CLASS[member.pill]}`}
            />
          );
        })}
      </span>
      <button
        type="button"
        aria-pressed={lit}
        onClick={() => {
          setParams(current => new URLSearchParams(orderSearch(current, lit ? null : order.key)), {
            replace: true,
          });
        }}
        className="ml-auto whitespace-nowrap rounded px-2 py-0.5 text-console-11 font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
      >
        {lit ? 'Clear highlight' : 'Highlight members'}
      </button>
    </li>
  );
}

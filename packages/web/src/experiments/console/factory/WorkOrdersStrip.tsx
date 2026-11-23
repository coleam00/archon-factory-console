import { useId, useState, type ReactElement } from 'react';
import { displayItemKey } from './lib/item-key';
import { ChevronDown } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { statusDotClass } from '../lib/run-status';
import { itemPath, PILL_LABEL, type Pill } from './lib/board';
import { NOT_STARTED, orderSearch, type WorkOrder } from './lib/work-orders';

/** A member's state as a dot, in the colour its pill has. */
const PILL_DOT_CLASS: Record<Pill, string> = {
  running: statusDotClass.running,
  'needs-you': 'bg-warning',
  failed: 'bg-error',
  parked: 'bg-text-secondary',
  waiting: 'bg-text-tertiary/60',
  landed: 'bg-success',
};

/**
 * The work orders with a member on the board, in the board's toolbar: one summary line
 * ("2 work orders · 1 open") that lists them on a click, one compact row each with the
 * order, how many of its members merged, each member's state, and a toggle that lights its
 * members on the board. A lit order is named on the summary line with a way to clear it, so
 * a card's "part of" link lights something visible without opening the list. Nothing when no
 * item is part of an order.
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
  const [open, setOpen] = useState(false);
  const [, setParams] = useSearchParams();
  const list = useId();
  // An order whose members have no run yet has nothing on the board to light; its page has it.
  const shown = orders.filter(order => order.members.some(member => member.where !== NOT_STARTED));
  if (shown.length === 0) return null;
  const pending = shown.filter(order => order.landed < order.members.length).length;
  const count = `${shown.length.toString()} work order${shown.length === 1 ? '' : 's'}`;
  // Named only when `?order=` lights cards (`highlightedKeys` finds the order), so an old or
  // mistyped key never claims a highlight the board does not show.
  const lighting = orders.some(order => order.key === lit) ? lit : null;
  return (
    <>
      <span className="flex min-w-0 items-center gap-2 text-console-12">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={list}
          onClick={() => {
            setOpen(was => !was);
          }}
          className="flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        >
          {`${count} · ${pending.toString()} open`}
          <ChevronDown
            aria-hidden="true"
            className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          />
        </button>
        {lighting === null ? null : (
          <>
            <span className="min-w-0 truncate text-text-primary">highlighting {lighting}</span>
            <button
              type="button"
              onClick={() => {
                setParams(current => new URLSearchParams(orderSearch(current, null)), {
                  replace: true,
                });
              }}
              className="whitespace-nowrap rounded px-2 py-0.5 font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              Clear highlight
            </button>
          </>
        )}
      </span>
      {open ? (
        // Its own line under the toolbar, capped so a long list never takes the columns' height.
        <ul
          id={list}
          aria-label="Work orders"
          className="order-last flex max-h-32 basis-full flex-col gap-1.5 overflow-y-auto"
        >
          {shown.map(order => (
            <WorkOrderRow
              key={order.key}
              projectId={projectId}
              order={order}
              lit={order.key === lit}
            />
          ))}
        </ul>
      ) : null}
    </>
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
  const landedWords = `${order.landed.toString()} of ${total.toString()} merged`;
  return (
    <li
      data-order={order.key}
      className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded border bg-surface-elevated px-2.5 py-1.5 text-console-12 ${
        lit ? 'border-accent-bright' : 'border-border'
      }`}
    >
      <Link
        to={itemPath(projectId, order.key)}
        className="font-mono text-console-12 text-accent-bright hover:underline"
      >
        {displayItemKey(order.key)}
      </Link>
      <span className="min-w-0 max-w-full truncate text-text-primary">{order.title}</span>
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
          const label = `${displayItemKey(member.key)}: ${PILL_LABEL[member.pill]}`;
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
        className="ml-auto whitespace-nowrap rounded px-2 py-0.5 text-console-12 font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
      >
        {lit ? 'Clear highlight' : 'Highlight members'}
      </button>
    </li>
  );
}

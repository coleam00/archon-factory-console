import type { ReactElement } from 'react';
import type { EntityView } from '../store/cache';
import { SlowReadError } from './lib/deadline';

/** What a Factory page says while a read that missed its deadline is retried. */
export const SLOW_READ_NOTICE = 'This is taking longer than usual. Trying again…';

/**
 * What a Factory page shows while a read has no data yet: `label` while it loads, and a
 * notice while the read is retried after missing its deadline (`useFactoryRead` retries it),
 * rather than a "Loading" that never ends. Any other failure is the page's own to show.
 */
export function FactoryLoading({
  read,
  label = 'Loading…',
  className = 'text-xs text-text-tertiary',
}: {
  read: Pick<EntityView<unknown>, 'error'>;
  label?: string;
  className?: string;
}): ReactElement {
  return (
    <p role="status" className={className}>
      {read.error instanceof SlowReadError ? SLOW_READ_NOTICE : label}
    </p>
  );
}

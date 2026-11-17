import { useEffect, useRef, type ReactElement } from 'react';
import type { EntityView } from '../store/cache';
import { SlowReadError } from './lib/deadline';

/** The wait before the first retry of a read that missed its deadline, doubling to the cap. */
const RETRY_FIRST_MS = 2_000;
const RETRY_MAX_MS = 15_000;

type RetriableRead = Pick<EntityView<unknown>, 'error' | 'refetch'>;

/**
 * Retry `read` while it fails by missing its deadline, waiting longer each time. Returns
 * whether it is in that state. Keyed on the error itself: each failed attempt is a new error,
 * so one failure schedules one retry, however often the page renders meanwhile.
 */
function useRetryWhenSlow(read: RetriableRead): boolean {
  const slow = read.error instanceof SlowReadError ? read.error : undefined;
  const refetch = useRef(read.refetch);
  refetch.current = read.refetch;
  const attempts = useRef(0);
  useEffect(() => {
    if (slow === undefined) {
      attempts.current = 0;
      return;
    }
    const wait = Math.min(RETRY_FIRST_MS * 2 ** attempts.current, RETRY_MAX_MS);
    attempts.current += 1;
    const timer = setTimeout(() => {
      if (slow.claimRetry()) refetch.current();
    }, wait);
    return (): void => {
      clearTimeout(timer);
    };
  }, [slow]);
  return slow !== undefined;
}

/**
 * What a Factory page shows while a read has no data yet: `label` while it loads, and a
 * notice while it retries a read that missed its deadline, rather than a "Loading" that
 * never ends. Any other failure is the page's own to show.
 */
export function FactoryLoading({
  read,
  label = 'Loading…',
  className = 'text-xs text-text-tertiary',
}: {
  read: RetriableRead;
  label?: string;
  className?: string;
}): ReactElement {
  const slow = useRetryWhenSlow(read);
  return (
    <p role="status" className={className}>
      {slow ? 'This is taking longer than usual. Trying again…' : label}
    </p>
  );
}

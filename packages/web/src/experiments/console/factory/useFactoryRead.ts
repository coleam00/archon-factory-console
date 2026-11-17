import { useRef } from 'react';
import { useEntity, type EntityView } from '../store/cache';
import { deadlineOf, nextDeadlineMs, type WithinDeadline } from './lib/deadline';

/**
 * A Factory read, kept in the cache under `key`, whose requests each run under a deadline
 * (`read` passes them through `within`). The first attempt gets `FACTORY_READ_DEADLINE_MS`;
 * a retry after a miss gets twice the deadline it missed, so a read that is slow but healthy
 * still lands. The last miss is read at load time, from the render that showed it: a retry
 * (`refetch`) or an invalidation loads after that render.
 */
export function useFactoryRead<T>(
  key: string,
  read: (within: WithinDeadline) => Promise<T>
): EntityView<T> {
  const lastError = useRef<Error | undefined>(undefined);
  const view = useEntity<T>(key, () => read(deadlineOf(nextDeadlineMs(lastError.current))));
  lastError.current = view.error;
  return view;
}

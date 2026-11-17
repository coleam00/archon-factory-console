/**
 * How long a Factory read may take before the page says so and tries again. A healthy read
 * answers in a fraction of a second and a cold progress read on a large project in a few, so
 * this only fires on a read that is stuck: queued behind a full connection pool, say (#39).
 */
export const FACTORY_READ_DEADLINE_MS = 8_000;

/** A read that did not answer by its deadline and was cancelled; the page retries it. */
export class SlowReadError extends Error {
  private retryClaimed = false;

  constructor(ms: number) {
    super(`No answer after ${(ms / 1000).toString()} s`);
    this.name = 'SlowReadError';
  }

  /**
   * True for the first caller only. Several parts of a page show the same read (the Overview's
   * numbers, map and list all wait on the items), and one failure is retried once, not once
   * per part.
   */
  claimRetry(): boolean {
    if (this.retryClaimed) return false;
    this.retryClaimed = true;
    return true;
  }
}

/**
 * Run `read` with a signal that aborts after `ms`, and reject with `SlowReadError` then. The
 * abort cancels the request, so a retry does not queue behind the read it gave up on. A
 * read that settles in time settles the result and clears the timer.
 */
export function withDeadline<T>(ms: number, read: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new SlowReadError(ms));
      controller.abort();
    }, ms);
    // After the deadline the read rejects with the abort; the promise has settled by then,
    // so that rejection is handled here and goes nowhere.
    read(controller.signal).then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/** A Factory read under the section's deadline. */
export function factoryRead<T>(read: (signal: AbortSignal) => Promise<T>): Promise<T> {
  return withDeadline(FACTORY_READ_DEADLINE_MS, read);
}

/**
 * The failure a page shows for a read: its error, unless the read only missed its deadline,
 * which the page shows as a retry instead (`FactoryLoading`).
 */
export function readFailed(error: Error | undefined): Error | undefined {
  return error instanceof SlowReadError ? undefined : error;
}

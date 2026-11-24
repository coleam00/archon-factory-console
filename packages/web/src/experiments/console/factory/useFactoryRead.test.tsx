import { afterEach, expect, jest, test } from 'bun:test';
import { act, type ReactElement } from 'react';
import { installDom } from '../test-dom.test-helpers';
import { invalidate } from '../store/cache';
import { FactoryLoading, SLOW_READ_NOTICE } from './FactoryLoading';
import { FACTORY_READ_DEADLINE_MS } from './lib/deadline';
import { useFactoryRead } from './useFactoryRead';

const { mount } = await installDom();
afterEach(() => {
  jest.useRealTimers();
});

const advance = (ms: number): Promise<void> =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

/** A read that never answers, as one queued behind a full connection pool; counts attempts. */
function stalled(): { attempts: () => number; read: (signal: AbortSignal) => Promise<string> } {
  let attempts = 0;
  return {
    attempts: () => attempts,
    read: signal => {
      attempts += 1;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    },
  };
}

test('a read that missed its deadline says so and retries itself, waiting longer each time', async () => {
  jest.useFakeTimers();
  const key = 'factory-stalled-read-test';
  const stall = stalled();
  function Stalled(): ReactElement {
    const read = useFactoryRead(key, within => within(stall.read));
    return <FactoryLoading read={read}>L</FactoryLoading>;
  }
  const page = await mount(<Stalled />);
  const text = (): string => page.container.textContent ?? '';
  try {
    expect(text()).toBe('L');
    expect(stall.attempts()).toBe(1);
    // The 8 s deadline passes: the page says so above its skeleton.
    await advance(FACTORY_READ_DEADLINE_MS);
    expect(text()).toBe(`${SLOW_READ_NOTICE}L`);
    await advance(1_999);
    expect(stall.attempts()).toBe(1);
    await advance(1);
    expect(stall.attempts()).toBe(2);
    // The retry has a 16 s deadline; after it misses, the next wait is 4 s, not 2.
    await advance(16_000);
    await advance(3_999);
    expect(stall.attempts()).toBe(2);
    expect(text()).toBe(`${SLOW_READ_NOTICE}L`);
    await advance(1);
    expect(stall.attempts()).toBe(3);
  } finally {
    await page.unmount();
    invalidate(key);
  }
});

test('readers of the same key retry it once between them', async () => {
  jest.useFakeTimers();
  const key = 'factory-shared-read-test';
  const stall = stalled();
  // Each shows nothing while it waits: the retry does not depend on a loading notice.
  function Reader(): null {
    useFactoryRead(key, within => within(stall.read));
    return null;
  }
  const page = await mount(
    <>
      <Reader />
      <Reader />
      <Reader />
    </>
  );
  try {
    expect(stall.attempts()).toBe(1);
    await advance(FACTORY_READ_DEADLINE_MS);
    await advance(2_000);
    expect(stall.attempts()).toBe(2);
    // Past the retry's 16 s deadline, short of the next 4 s wait. Without the dedup, the other
    // readers' retries, queued behind attempt 2 by the cache, start a third attempt here.
    await advance(16_000);
    expect(stall.attempts()).toBe(2);
  } finally {
    await page.unmount();
    invalidate(key);
  }
});

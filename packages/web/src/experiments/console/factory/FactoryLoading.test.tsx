import { afterAll, expect, jest, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, type ReactElement } from 'react';
import { FactoryLoading } from './FactoryLoading';
import { SlowReadError } from './lib/deadline';

const dom = new Window({ url: 'http://localhost' });
const globals = { window: dom, document: dom.document, IS_REACT_ACT_ENVIRONMENT: true };
const descriptors = new Map(
  Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
);
for (const [key, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import('react-dom/client');

afterAll(async () => {
  jest.useRealTimers();
  await dom.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

async function mount(): Promise<{
  show: (element: ReactElement) => Promise<void>;
  text: () => string;
  unmount: () => Promise<void>;
}> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  return {
    show: async element => act(async () => root.render(element)),
    text: () => container.textContent,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const advance = (ms: number): Promise<void> =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

test('a read that missed its deadline says so and retries, waiting longer each time', async () => {
  jest.useFakeTimers();
  let refetches = 0;
  const refetch = (): void => {
    refetches += 1;
  };
  const page = await mount();
  await page.show(<FactoryLoading read={{ error: undefined, refetch }} />);
  expect(page.text()).toBe('Loading…');

  const first = new SlowReadError(8_000);
  await page.show(<FactoryLoading read={{ error: first, refetch }} />);
  expect(page.text()).toBe('This is taking longer than usual. Trying again…');
  await advance(1_999);
  expect(refetches).toBe(0);
  await advance(1);
  expect(refetches).toBe(1);
  // The same failure rendered again schedules nothing more.
  await page.show(<FactoryLoading read={{ error: first, refetch }} />);
  await advance(20_000);
  expect(refetches).toBe(1);

  // The retry missed its deadline too: the next wait is twice as long.
  await page.show(<FactoryLoading read={{ error: new SlowReadError(8_000), refetch }} />);
  await advance(3_999);
  expect(refetches).toBe(1);
  await advance(1);
  expect(refetches).toBe(2);

  // Any other failure is the page's to show; this only waits.
  await page.show(
    <FactoryLoading read={{ error: undefined, refetch }} label="Loading the step…" />
  );
  expect(page.text()).toBe('Loading the step…');
  await page.unmount();
});

test('parts of a page waiting on the same read retry it once between them', async () => {
  jest.useFakeTimers();
  let refetches = 0;
  const read = {
    error: new SlowReadError(8_000),
    refetch: (): void => {
      refetches += 1;
    },
  };
  const page = await mount();
  await page.show(
    <>
      <FactoryLoading read={read} />
      <FactoryLoading read={read} />
      <FactoryLoading read={read} />
    </>
  );
  await advance(2_000);
  expect(refetches).toBe(1);
  await page.unmount();
});

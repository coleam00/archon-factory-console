import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { ClampedSummary } from './ClampedSummary';

// The toggle shows on measured overflow and is clicked, which static markup cannot reach.
const dom = new Window({ url: 'http://localhost' });
const globals = { window: dom, document: dom.document, IS_REACT_ACT_ENVIRONMENT: true };
const descriptors = new Map(
  Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
);
for (const [key, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import('react-dom/client');

/*
 * happy-dom lays nothing out, so every height reads 0. The paragraph's heights are stubbed on
 * the prototype before mounting, since the summary measures as it mounts.
 */
const proto = dom.HTMLParagraphElement.prototype as object;
const heights = ['scrollHeight', 'clientHeight'].map(
  key => [key, Object.getOwnPropertyDescriptor(proto, key)] as const
);
function stubHeights(scroll: number, client: number): void {
  Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => scroll });
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => client });
}

let unmount: (() => Promise<void>) | undefined;
afterEach(async () => {
  await unmount?.();
  unmount = undefined;
  for (const [key, descriptor] of heights)
    if (descriptor) Object.defineProperty(proto, key, descriptor);
    else Reflect.deleteProperty(proto, key);
});

afterAll(async () => {
  await dom.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

async function mount(): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(<ClampedSummary text="A long summary of the factory." lines={2} />)
  );
  unmount = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return container;
}

describe('the clamped summary', () => {
  test('clamped text that overflows gets More, which expands it, and Less folds it again', async () => {
    stubHeights(240, 66);
    const page = await mount();
    const toggle = (): HTMLButtonElement => page.querySelector('button') as HTMLButtonElement;
    expect(page.querySelector('p')?.textContent).toBe('A long summary of the factory.');
    expect(toggle().textContent).toBe('More');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');

    await act(async () => toggle().click());
    expect(toggle().textContent).toBe('Less');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');

    await act(async () => toggle().click());
    expect(toggle().textContent).toBe('More');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  test('text that fits in its lines gets no toggle', async () => {
    stubHeights(44, 44);
    const page = await mount();
    expect(page.querySelector('p')?.textContent).toBe('A long summary of the factory.');
    expect(page.querySelector('button')).toBeNull();
  });
});

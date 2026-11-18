import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { OVERVIEW } from '../lib/overview.test-fixtures';
import { OverviewBody } from './OverviewPage';

// Opening a view and going back up need clicks, which static markup cannot reach.
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
  await dom.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

let unmount: (() => Promise<void>) | undefined;
afterEach(async () => {
  await unmount?.();
  unmount = undefined;
});

async function mount(at = '/console/p/cb-1/factory/how-it-works'): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route
            path="/console/p/:projectId/factory/how-it-works"
            element={<OverviewBody overview={OVERVIEW} />}
          />
        </Routes>
      </MemoryRouter>
    )
  );
  unmount = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return container;
}

const cards = (within: ParentNode): string[] =>
  [...within.querySelectorAll('[data-card]')].map(card => card.getAttribute('data-card') ?? '');
const crumbs = (within: ParentNode): string =>
  [...within.querySelectorAll('nav[aria-label="Breadcrumb"] li')]
    .map(li => li.textContent?.replace('›', '').trim())
    .join(' › ');

async function click(element: Element | null | undefined): Promise<void> {
  if (!element) throw new Error('nothing to click');
  await act(async () => (element as HTMLElement).click());
}

const button = (within: ParentNode, text: string): Element | undefined =>
  [...within.querySelectorAll('button')].find(b => b.textContent?.includes(text));

describe('the factory overview', () => {
  test('opens at the root with its cards, caption and every view listed with its count', async () => {
    const page = await mount();
    expect(cards(page)).toEqual(['in', 'make', 'check']);
    expect(crumbs(page)).toBe('How it works');
    expect(page.textContent).toContain('Work comes in, is made, and is checked.');
    const listed = [...page.querySelectorAll('aside[aria-label="Views"] li')].map(li =>
      li.textContent?.trim()
    );
    expect(listed).toEqual(['How it works3', 'Make2', 'Test it1', 'Check1']);
    // Only a card that opens a view is a button.
    expect(page.querySelector('button[data-card="in"]')).toBeNull();
    // Up one level has nowhere to go from the root.
    expect((button(page, 'Up one level') as HTMLButtonElement).disabled).toBe(true);
  });

  test('a card opens its drill-down, and the breadcrumb leads back to the root', async () => {
    const page = await mount();
    await click(page.querySelector('[data-card="make"]'));
    expect(cards(page)).toEqual(['write', 'test']);
    expect(crumbs(page)).toBe('How it works › Make');
    expect(page.textContent).toContain('How a change is made.');

    await click(page.querySelector('[data-card="test"]'));
    expect(crumbs(page)).toBe('How it works › Make › Test it');
    await click(button(page, 'Up one level'));
    expect(crumbs(page)).toBe('How it works › Make');

    await click(
      button(page.querySelector('nav[aria-label="Breadcrumb"]') as Element, 'How it works')
    );
    expect(cards(page)).toEqual(['in', 'make', 'check']);
  });

  test('the sidebar opens any view; an unknown ?view= opens the root and says so', async () => {
    const page = await mount('/console/p/cb-1/factory/how-it-works?view=gone');
    expect(cards(page)).toEqual(['in', 'make', 'check']);
    // It names the view it could not find rather than silently showing the root.
    expect(page.textContent).toContain('"gone"');
    await click(button(page.querySelector('aside') as Element, 'Test it'));
    expect(cards(page)).toEqual(['run']);
    expect(crumbs(page)).toBe('How it works › Make › Test it');
  });

  test('on a phone the views are a select showing the open view, and choosing one opens it', async () => {
    const page = await mount();
    const select = page.querySelector('aside select') as HTMLSelectElement;
    expect(select.value).toBe('top');
    const nb = (n: number): string => String.fromCharCode(160).repeat(n);
    expect([...select.options].map(o => o.textContent)).toEqual([
      'How it works (3)',
      `${nb(2)}Make (2)`,
      `${nb(4)}Test it (1)`,
      `${nb(2)}Check (1)`,
    ]);
    await act(async () => {
      select.value = 'check';
      select.dispatchEvent(new dom.Event('change', { bubbles: true }) as unknown as Event);
    });
    expect(cards(page)).toEqual(['read']);
    expect(crumbs(page)).toBe('How it works › Check');
    expect((page.querySelector('aside select') as HTMLSelectElement).value).toBe('check');
  });

  test('full screen draws over the console until Exit or Esc', async () => {
    const page = await mount();
    await click(button(page, 'Full screen'));
    const overlay = document.body.querySelector('[role="dialog"]');
    expect(overlay?.getAttribute('aria-label')).toBe('How it works, full screen');
    expect(cards(overlay as Element)).toEqual(['in', 'make', 'check']);
    // Views open inside it too.
    await click(overlay?.querySelector('[data-card="check"]'));
    expect(cards(document.body.querySelector('[role="dialog"]') as Element)).toEqual(['read']);

    await act(async () => {
      window.dispatchEvent(new dom.KeyboardEvent('keydown', { key: 'Escape' }) as unknown as Event);
    });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(cards(page)).toEqual(['read']);

    await click(button(page, 'Full screen'));
    await click(
      button(document.body.querySelector('[role="dialog"]') as Element, 'Exit full screen')
    );
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});

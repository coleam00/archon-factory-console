import { describe, expect, test } from 'bun:test';
import type { FactoryPacksRead, FactoryViews } from '../api';
import { currentView, factoryTabShown, stageSwitchLink } from './views';

const view = (pack: string, source: FactoryViews['views'][number]['source']) =>
  ({
    pack,
    source,
    path: `/${pack}`,
    declaration: { title: pack },
  }) as FactoryViews['views'][number];
const packs = (...projects: string[]): FactoryPacksRead =>
  ({
    packs: [{ projects: projects.map(codebaseId => ({ codebaseId, name: codebaseId })) }],
  }) as FactoryPacksRead;

describe('factoryTabShown', () => {
  test('shown for a project a pack lists, hidden for one it does not', () => {
    expect(factoryTabShown(packs('a', 'b'), 'b')).toBe(true);
    expect(factoryTabShown(packs('a'), 'b')).toBe(false);
  });

  test('hidden while the packs read loads or after it fails, and for a body that is no listing', () => {
    expect(factoryTabShown(undefined, 'a')).toBe(false);
    expect(factoryTabShown([] as unknown as FactoryPacksRead, 'a')).toBe(false);
  });
});

test('the current view is the first listed', () => {
  const listing = { views: [view('mine', 'project-file'), view('pack', 'project')], errors: [] };
  expect(currentView(listing)?.pack).toBe('mine');
  expect(currentView({ views: [], errors: [] })).toBeUndefined();
});

describe("a step's tag opening another stage", () => {
  const to = { pathname: '/console/p/p1/factory', search: '?stage=checks' };

  test('in a pushed modal it replaces the entry and keeps its state, so Close still goes back', () => {
    expect(
      stageSwitchLink('p1', 'checks', { search: '?stage=build', state: { stageModal: true } })
    ).toEqual({ to, replace: true, state: { stageModal: true, tab: 'workflow' } });
  });

  test("in a pasted link's modal it stays a modal Close drops in place", () => {
    expect(stageSwitchLink('p1', 'checks', { search: '?stage=build', state: null })).toEqual({
      to,
      replace: true,
      state: { tab: 'workflow' },
    });
  });

  test('from outside a modal it pushes the modal, as a map link does', () => {
    expect(stageSwitchLink('p1', 'checks', { search: '', state: null })).toEqual({
      to,
      replace: false,
      state: { stageModal: true, tab: 'workflow' },
    });
  });
});

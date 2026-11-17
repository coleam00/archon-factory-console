import { describe, expect, test } from 'bun:test';
import type { FactoryViews } from '../../skills/factory';
import { currentView, factoryTabShown } from './views';

const view = (pack: string, source: FactoryViews['views'][number]['source']) =>
  ({
    pack,
    source,
    path: `/${pack}`,
    declaration: { title: pack },
  }) as FactoryViews['views'][number];
const error = (source: FactoryViews['errors'][number]['source']) => ({
  pack: 'p',
  source,
  path: '/p',
  error: 'is invalid',
});

describe('factoryTabShown', () => {
  test('shown when a view applies', () => {
    expect(factoryTabShown({ views: [view('a', 'installed')], errors: [] })).toBe(true);
  });

  test("shown for a broken project file, so its error is seen; not for another pack's", () => {
    expect(factoryTabShown({ views: [], errors: [error('project-file')] })).toBe(true);
    expect(factoryTabShown({ views: [], errors: [error('installed')] })).toBe(false);
  });

  test('hidden with no views, and while the listing loads', () => {
    expect(factoryTabShown({ views: [], errors: [] })).toBe(false);
    expect(factoryTabShown(undefined)).toBe(false);
  });
});

test('the current view is the first listed', () => {
  const listing = { views: [view('mine', 'project-file'), view('pack', 'project')], errors: [] };
  expect(currentView(listing)?.pack).toBe('mine');
  expect(currentView({ views: [], errors: [] })).toBeUndefined();
});

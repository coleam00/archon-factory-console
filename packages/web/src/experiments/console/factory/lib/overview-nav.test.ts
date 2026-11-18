import { describe, expect, test } from 'bun:test';
import { OVERVIEW } from './overview.test-fixtures';
import { howItWorksShown, openView, viewList, viewTrail } from './overview-nav';

describe('viewTrail', () => {
  test('runs from the root, named by its title, to the view, named by the card that opens it', () => {
    expect(viewTrail(OVERVIEW, 'test')).toEqual([
      { id: 'top', label: 'How it works' },
      { id: 'make', label: 'Make' },
      { id: 'test', label: 'Test it' },
    ]);
    expect(viewTrail(OVERVIEW, 'top')).toEqual([{ id: 'top', label: 'How it works' }]);
  });
});

describe('viewList', () => {
  test("lists every view depth first, with its depth, card count and its opener's line", () => {
    expect(viewList(OVERVIEW)).toEqual([
      { id: 'top', label: 'How it works', depth: 0, cards: 3, line: undefined },
      { id: 'make', label: 'Make', depth: 1, cards: 2, line: 'What Make does.' },
      { id: 'test', label: 'Test it', depth: 2, cards: 1, line: 'What Test it does.' },
      { id: 'check', label: 'Check', depth: 1, cards: 1, line: 'What Check does.' },
    ]);
  });
});

describe('openView', () => {
  test('the root without ?view=, the view it names, and the root for an unknown one, saying so', () => {
    expect(openView(OVERVIEW, null)).toEqual({ id: 'top', unknown: undefined });
    expect(openView(OVERVIEW, 'make')).toEqual({ id: 'make', unknown: undefined });
    expect(openView(OVERVIEW, 'gone')).toEqual({ id: 'top', unknown: 'gone' });
  });
});

describe('howItWorksShown', () => {
  const overview = {
    pack: 'acme/kit',
    source: 'project-file' as const,
    path: '/o.json',
    declaration: OVERVIEW,
  };
  test('shows for a file, a broken file or a failed read; not unread or read as none', () => {
    expect(howItWorksShown({ data: undefined, error: undefined })).toBe(false);
    expect(howItWorksShown({ data: { overview: null, errors: [] }, error: undefined })).toBe(false);
    expect(howItWorksShown({ data: { overview, errors: [] }, error: undefined })).toBe(true);
    const broken = {
      pack: 'acme.kit',
      source: 'project-file' as const,
      path: '/o.json',
      error: 'bad',
    };
    expect(howItWorksShown({ data: { overview: null, errors: [broken] }, error: undefined })).toBe(
      true
    );
    expect(howItWorksShown({ data: undefined, error: new Error('500') })).toBe(true);
  });
});

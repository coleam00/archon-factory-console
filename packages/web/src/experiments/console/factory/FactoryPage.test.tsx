import { afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ProjectViewTabs } from '../components/ProjectViewTabs';
import type { FactoryViews } from '../skills/factory';
import type { AttentionQueue } from '../skills/runs';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import { BoardPage } from './BoardPage';
import { FactoryPage } from './FactoryPage';
import { FactoryPlaceholder } from './FactoryPlaceholder';
import { askItem } from './needs-you.test-fixtures';

const ID = 'cb-1';

afterEach(() => {
  invalidate('factory-views');
  invalidate('project');
  invalidate('runs');
  invalidate('factory-items');
});

const asking: AttentionQueue = { items: [askItem()], runs: [], degraded: [] };
const quiet: AttentionQueue = { items: [], runs: [], degraded: [] };

const withView: FactoryViews = {
  views: [
    {
      pack: 'acme/kit',
      source: 'project-file',
      path: '/repo/.archon/packs/acme.kit.factory-view.json',
      declaration: {
        version: 1,
        pack: 'acme/kit',
        title: 'Kit factory',
        summary: 'Issues come in; changes go out.',
        stages: [
          { id: 'build', label: 'Build', blurb: 'Builds.', group: 'build', workflows: ['deliver'] },
        ],
        placement: {},
        endings: {},
        landed: { stage: 'build' },
        map: { cards: [], arrows: [] },
      },
    },
  ],
  errors: [],
};
const none: FactoryViews = { views: [], errors: [] };

/**
 * Every link marked as the current page, as `href label`, whatever its other attributes:
 * the project tab and the sub-navigation entry. Styling is not what is asserted.
 */
const currentLinks = (html: string): string[] =>
  [...html.matchAll(/<a\s([^>]*)>(.*?)<\/a>/g)]
    .filter(([, attributes]) => / aria-current="page"|^aria-current="page"/.test(attributes ?? ''))
    .map(([, attributes, body]) => {
      const href = /href="([^"]*)"/.exec(attributes ?? '')?.[1] ?? '';
      return `${href} ${(body ?? '').replace(/<[^>]*>/g, '')}`;
    });

function render(path: string, listing: FactoryViews, attention: AttentionQueue = quiet): string {
  set(K.factoryViews(ID), listing);
  set(K.factoryAttention(ID), attention);
  set(K.factoryItems(ID), []);
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/console/p/:projectId/factory" element={<FactoryPage />} />
        <Route path="/console/p/:projectId/factory/board" element={<BoardPage />} />
        <Route
          path="/console/p/:projectId/factory/steps/:workflow/:node"
          element={<FactoryPlaceholder page="step" />}
        />
        <Route
          path="/console/p/:projectId"
          element={<ProjectViewTabs projectId={ID} active="runs" />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('the Factory tab', () => {
  test('follows Metrics when a view applies to the project', () => {
    const html = render(`/console/p/${ID}`, withView);
    expect(html.match(/>(Runs|Chat|Metrics|Factory)</g)).toEqual([
      '>Runs<',
      '>Chat<',
      '>Metrics<',
      '>Factory<',
    ]);
    expect(html).toContain(`href="/console/p/${ID}/factory"`);
  });

  test('is absent when no view applies', () => {
    expect(render(`/console/p/${ID}`, none)).not.toContain('Factory');
  });
});

describe('the Overview', () => {
  test("shows the view's title, summary and sub-navigation", () => {
    const html = render(`/console/p/${ID}/factory`, withView);
    expect(html).toContain('Kit factory');
    expect(html).toContain('Issues come in; changes go out.');
    expect(currentLinks(html)).toEqual([
      `/console/p/${ID}/factory Factory`,
      `/console/p/${ID}/factory Overview`,
    ]);
    expect(html).toContain(`href="/console/p/${ID}/factory/board"`);
    expect(html).toContain(`href="/console/p/${ID}/factory#needs-you"`);
    expect(html).toContain('id="needs-you"');
  });

  test('the sub-navigation counts what needs you, on every Factory page', () => {
    const needsYouLink = (html: string): string | undefined =>
      /<a [^>]*href="[^"]*#needs-you"[^>]*>(.*?)<\/a>/.exec(html)?.[1];
    expect(needsYouLink(render(`/console/p/${ID}/factory`, withView, asking))).toContain(
      'aria-label="1 waiting"'
    );
    expect(needsYouLink(render(`/console/p/${ID}/factory/board`, withView, asking))).toContain(
      '>1</span>'
    );
    expect(needsYouLink(render(`/console/p/${ID}/factory`, withView, quiet))).toBe('Needs you');
  });

  test('lists what needs you on the Overview', () => {
    const html = render(`/console/p/${ID}/factory`, withView, asking);
    expect(html).toContain('Which base should the change target?');
    expect(html).toContain('Recommended: Use dev');
  });

  test('a broken project file shows its path and error, not an empty state', () => {
    const html = render(`/console/p/${ID}/factory`, {
      views: [],
      errors: [
        { pack: 'acme.kit', source: 'project-file', path: '/repo/x.json', error: 'is invalid' },
      ],
    });
    expect(html).toContain('/repo/x.json');
    expect(html).toContain('is invalid');
    expect(html).not.toContain('No factory view applies');
  });

  test('a project no view applies to gets an empty state', () => {
    expect(render(`/console/p/${ID}/factory`, none)).toContain(
      'No factory view applies to this project'
    );
  });
});

describe('the board', () => {
  test('sits under Board in the sub-navigation, its columns the declared stages', () => {
    const html = render(`/console/p/${ID}/factory/board`, withView);
    expect(currentLinks(html)).toEqual([
      `/console/p/${ID}/factory Factory`,
      `/console/p/${ID}/factory/board Board`,
    ]);
    expect(html).toContain('aria-label="Build"');
    expect(html).not.toContain('is coming next');
  });
});

describe('the pages not built yet', () => {
  test('a step page names the workflow and step', () => {
    const html = render(`/console/p/${ID}/factory/steps/deliver/rounds.fix`, withView);
    expect(html).toContain('deliver · rounds.fix');
    expect(html).toContain('is coming next');
  });
});

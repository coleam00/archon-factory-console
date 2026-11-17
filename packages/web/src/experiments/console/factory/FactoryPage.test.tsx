import { afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ProjectViewTabs } from '../components/ProjectViewTabs';
import type { FactoryViews } from '../skills/factory';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import { FactoryPage } from './FactoryPage';
import { FactoryPlaceholder } from './FactoryPlaceholder';

const ID = 'cb-1';

afterEach(() => {
  invalidate('factory-views');
  invalidate('project');
});

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

/** The sub-navigation link marked as the current page, as rendered. */
const current = (href: string, label: string): string =>
  `<a aria-current="page" class="rounded px-2 py-1 text-console-12 font-medium transition-colors bg-surface-elevated text-text-primary" href="${href}" data-discover="true">${label}</a>`;

function render(path: string, listing: FactoryViews): string {
  set(K.factoryViews(ID), listing);
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/console/p/:projectId/factory" element={<FactoryPage />} />
        <Route
          path="/console/p/:projectId/factory/board"
          element={<FactoryPlaceholder page="board" />}
        />
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
    expect(html).toContain(current(`/console/p/${ID}/factory`, 'Overview'));
    expect(html).toContain(`href="/console/p/${ID}/factory/board"`);
    expect(html).toContain(`href="/console/p/${ID}/factory#needs-you"`);
    expect(html).toContain('id="needs-you"');
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

describe('the pages not built yet', () => {
  test('the board says it is coming next and leads back to the overview', () => {
    const html = render(`/console/p/${ID}/factory/board`, withView);
    expect(html).toContain('The board');
    expect(html).toContain('is coming next');
    expect(html).toContain(current(`/console/p/${ID}/factory/board`, 'Board'));
    expect(html).toContain('Back to the overview');
  });

  test('a step page names the workflow and step', () => {
    const html = render(`/console/p/${ID}/factory/steps/deliver/rounds.fix`, withView);
    expect(html).toContain('deliver · rounds.fix');
    expect(html).toContain('is coming next');
  });
});

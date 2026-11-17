import { afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ProjectViewTabs } from '../components/ProjectViewTabs';
import type { FactoryViews, FactoryWorkflow } from '../skills/factory';
import type { AttentionQueue } from '../skills/runs';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import { FactoryPage } from './FactoryPage';
import { FactoryPlaceholder } from './FactoryPlaceholder';
import { StagePage } from './StagePage';
import { StepPage } from './StepPage';
import deliverJson from './lib/fixtures/deliver-workflow.json';
import { askItem } from './needs-you.test-fixtures';

const ID = 'cb-1';

afterEach(() => {
  invalidate('factory-views');
  invalidate('factory-workflow');
  invalidate('project');
  invalidate('runs');
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
          {
            id: 'build',
            label: 'Build',
            blurb: 'Builds.',
            group: 'build',
            workflows: ['deliver'],
            nodes: ['build__build', 'rounds.fix'],
          },
          {
            id: 'checks',
            label: 'Checks',
            blurb: 'Checks the change.',
            group: 'check',
            workflows: ['deliver'],
            nodes: ['rounds.review__review'],
          },
          { id: 'landed', label: 'Landed', blurb: 'Merged.', group: 'land', workflows: [] },
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

function render(
  path: string | { pathname: string; state: unknown },
  listing: FactoryViews,
  attention: AttentionQueue = quiet
): string {
  set(K.factoryViews(ID), listing);
  set(K.factoryAttention(ID), attention);
  set(K.factoryWorkflow(ID, 'deliver'), deliverJson as FactoryWorkflow);
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/console/p/:projectId/factory" element={<FactoryPage />} />
        <Route
          path="/console/p/:projectId/factory/board"
          element={<FactoryPlaceholder page="board" />}
        />
        <Route path="/console/p/:projectId/factory/stages/:stage" element={<StagePage />} />
        <Route path="/console/p/:projectId/factory/steps/:workflow/:node" element={<StepPage />} />
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

describe('the pages not built yet', () => {
  test('the board says it is coming next and leads back to the overview', () => {
    const html = render(`/console/p/${ID}/factory/board`, withView);
    expect(html).toContain('The board');
    expect(html).toContain('is coming next');
    expect(currentLinks(html)).toEqual([
      `/console/p/${ID}/factory Factory`,
      `/console/p/${ID}/factory/board Board`,
    ]);
    expect(html).toContain('Back to the overview');
  });
});

describe('the stage page', () => {
  test("shows the stage's label and blurb, then its workflow's steps framed by loop and include", () => {
    const html = render(`/console/p/${ID}/factory/stages/checks`, withView);
    expect(html).toContain('Checks');
    expect(html).toContain('Checks the change.');
    expect(html).toContain('up to 3 rounds');
    expect(html).toContain('>included<');
    for (const step of ['fix', 'base', 'review', 'tests', 'product', 'verdict'])
      expect(html).toContain(`>${step}</span>`);
    expect(html).toContain('Back to the overview');
  });

  test('a stage no workflow runs in says how an item arrives', () => {
    expect(render(`/console/p/${ID}/factory/stages/landed`, withView)).toContain(
      'No workflow runs in this stage.'
    );
  });

  test('a stage the view does not declare says so', () => {
    expect(render(`/console/p/${ID}/factory/stages/nope`, withView)).toContain(
      'This factory has no stage'
    );
  });
});

describe('the step page', () => {
  test('shows the kind, model, condition, prompt and YAML, and leads back to its stage', () => {
    const html = render(`/console/p/${ID}/factory/steps/deliver/rounds.fix`, withView);
    expect(html).toContain('deliver · rounds.fix');
    expect(html).toContain('Agent');
    expect(html).toContain('@builder, else large');
    expect(html).toContain('$LOOP_PREV.verdict__verdict.output.outcome');
    expect(html).toContain('Prompt, from command fix');
    expect(html).toContain('Fix what the checks returned');
    // The highlighted YAML block itself, not only its heading.
    expect(html).toContain('language-yaml');
    expect(html.replace(/<[^>]*>/g, '')).toContain('id: fix');
    expect(html).toContain(`href="/console/p/${ID}/factory/stages/build"`);
  });

  test('a step opened from a stage leads back to that stage', () => {
    const html = render(
      {
        pathname: `/console/p/${ID}/factory/steps/deliver/rounds.fix`,
        state: { fromStage: 'checks' },
      },
      withView
    );
    expect(html).toContain(`href="/console/p/${ID}/factory/stages/checks"`);
    expect(html).toContain('Back to Checks');
  });

  test('an included step leads back to the stage that works it', () => {
    const html = render(`/console/p/${ID}/factory/steps/deliver/rounds.review__review`, withView);
    expect(html).toContain('included from');
    expect(html).toContain(`href="/console/p/${ID}/factory/stages/checks"`);
  });

  test('a step the workflow does not have says so', () => {
    expect(render(`/console/p/${ID}/factory/steps/deliver/nope`, withView)).toContain('No step');
  });
});

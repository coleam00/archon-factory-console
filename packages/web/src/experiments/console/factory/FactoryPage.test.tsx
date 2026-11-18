import { afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes } from 'react-router';
import type { FactoryOverviewRead, FactoryViews, FactoryWorkflow } from '../skills/factory';
import type { AttentionQueue } from '../skills/runs';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import { projectRoutes } from '../routes/project-routes';
import deliverJson from './lib/fixtures/deliver-workflow.json';
import type { FactoryItem } from '../skills/factory';
import { PAGE, VIEW } from './lib/board.test-fixtures';
import { shippedListed } from './item-detail.test-fixtures';
import { askItem } from '../lib/needs-you.test-fixtures';
import { OVERVIEW } from './lib/overview.test-fixtures';

const ID = 'cb-1';

afterEach(() => {
  invalidate('factory-views');
  invalidate('factory-overview');
  invalidate('factory-workflow');
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
      packKey: 'acme.kit',
      runNames: { deliver: 'acme/kit:deliver' },
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
/** The declaration this repository ships, over the real items the board's fixtures hold. */
const shipped: FactoryViews = {
  views: [
    {
      ...shippedListed,
      declaration: VIEW,
    },
  ],
  errors: [],
};

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
  attention: AttentionQueue = quiet,
  items: FactoryItem[] = []
): string {
  set(K.factoryViews(ID), listing);
  set(K.projectAttention(ID), attention);
  set(K.factoryItems(ID), { items: [], members: {} });
  set(K.factoryWorkflow(ID, 'deliver'), deliverJson as FactoryWorkflow);
  set(K.factoryItems(ID), { items: items, members: {} });
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>{projectRoutes('/console/')}</Routes>
    </MemoryRouter>
  );
}

describe('the Factory tab', () => {
  test('follows Metrics when a view applies to the project', () => {
    const html = render(`/console/p/${ID}/needs-you`, withView);
    expect(html.match(/>(Needs you|Runs|Chat|Metrics|Factory)</g)).toEqual([
      '>Needs you<',
      '>Runs<',
      '>Chat<',
      '>Metrics<',
      '>Factory<',
    ]);
    expect(html).toContain(`href="/console/p/${ID}/factory"`);
  });

  test('is absent when no view applies', () => {
    expect(render(`/console/p/${ID}/needs-you`, none)).not.toContain('Factory');
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
    // Needs you is the project's tab; the sub-navigation (and the numbers' tile) link there.
    expect(html).not.toContain(`href="/console/p/${ID}/factory/needs-you"`);
    expect(html.split(`href="/console/p/${ID}/needs-you"`)).toHaveLength(4);
  });

  test('the sub-navigation counts what needs you, on every Factory page', () => {
    // The project tab and the sub-navigation entry: one count, the same on both.
    const needsYouLinks = (html: string): string[] =>
      [...html.matchAll(/<a [^>]*href="[^"]*\/p\/cb-1\/needs-you"[^>]*>(Needs you.*?)<\/a>/g)].map(
        ([, body]) => (body ?? '').replace(/<span aria-hidden="true"[^>]*><\/span>/, '')
      );
    for (const page of ['', '/board']) {
      const links = needsYouLinks(render(`/console/p/${ID}/factory${page}`, withView, asking));
      expect(links).toHaveLength(2);
      for (const link of links) expect(link).toContain('aria-label="1 waiting"');
    }
    expect(needsYouLinks(render(`/console/p/${ID}/factory`, withView, quiet))).toEqual([
      'Needs you',
      'Needs you',
    ]);
  });

  test('shows the summary only on the Overview; other pages show the title alone', () => {
    const summary = 'Issues come in; changes go out.';
    expect(render(`/console/p/${ID}/factory`, withView)).toContain(summary);
    for (const path of ['/board', '/stages/checks', '/steps/deliver/rounds.fix']) {
      const html = render(`/console/p/${ID}/factory${path}`, withView);
      expect(html).toContain('Kit factory');
      expect(html).not.toContain(summary);
    }
  });

  test('the numbers strip counts the board, each number linking to the board it counts', () => {
    const html = render(`/console/p/${ID}/factory`, shipped, quiet, PAGE.items);
    // The strip alone: the map's cards below are links drawn the same way.
    const strip = html.slice(
      html.indexOf('aria-label="Numbers"'),
      html.indexOf('aria-label="The map"')
    );
    const tiles = [
      ...strip.matchAll(
        /<a [^>]*href="([^"]*)"[^>]*><span[^>]*>([^<]*)<\/span><span[^>]*>([^<]*)</g
      ),
    ].map(([, href, value, label]) => `${value ?? ''} ${label ?? ''} → ${href ?? ''}`);
    const board = `/console/p/${ID}/factory/board`;
    expect(tiles).toEqual([
      `5 in flight → ${board}?show=in-flight`,
      `0 need you → /console/p/${ID}/needs-you`,
      expect.stringMatching(new RegExp(`^\\d+ landed today → ${board}\\?show=landed-today$`)),
      `3 of 8 done → ${board}?show=landed`,
      expect.stringMatching(
        new RegExp(` median from first run to landed → ${board}\\?show=landed$`)
      ),
    ]);
    // Above the map.
    expect(html.indexOf('aria-label="Numbers"')).toBeLessThan(html.indexOf('aria-label="The map"'));
  });

  test('lists what needs you on the Overview: the question and the recommended tile, opening on Needs you', () => {
    const html = render(`/console/p/${ID}/factory`, withView, asking);
    expect(html).toContain('Which base should the change target?');
    expect(html).toContain('Use dev');
    expect(html).toContain('>Recommended<');
    expect(html).toContain('High confidence. Dev is the working base.');
    expect(html).toContain(`href="/console/p/${ID}/needs-you?ask=ask%3A1"`);
    // Compact: no answer is sent from the Overview.
    expect(html).not.toContain('aria-pressed');
  });

  test('the map follows what needs you', () => {
    const html = render(`/console/p/${ID}/factory`, withView, asking);
    const needsYou = html.indexOf('aria-label="Needs you"');
    expect(needsYou).toBeGreaterThan(-1);
    expect(html.indexOf('aria-label="The map"')).toBeGreaterThan(needsYou);
  });

  test('the sub-navigation shows How it works only when the pack has an overview file, or a broken one', () => {
    const link = `href="/console/p/${ID}/factory/how-it-works"`;
    const withOverview = (read: FactoryOverviewRead | undefined): string => {
      if (read !== undefined) set(K.factoryOverview(ID), read);
      return render(`/console/p/${ID}/factory`, withView);
    };
    // Unread, and read as none: no entry.
    expect(withOverview(undefined)).not.toContain(link);
    expect(withOverview({ overview: null, errors: [] })).not.toContain(link);
    const overview = {
      pack: 'acme/kit',
      source: 'project-file' as const,
      path: '/repo/.archon/packs/acme.kit.factory-overview.json',
      declaration: OVERVIEW,
    };
    expect(withOverview({ overview, errors: [] })).toContain(link);
    // A broken file shows the entry and its error, with the view files' errors.
    const broken = withOverview({
      overview: null,
      errors: [
        { pack: 'acme.kit', source: 'project-file', path: '/repo/o.json', error: 'bad root' },
      ],
    });
    expect(broken).toContain(link);
    expect(broken).toContain('/repo/o.json');
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

/** Six open asks, newest last: more than the Overview shows. */
const sixAsks: AttentionQueue = {
  items: Array.from({ length: 6 }, (_, i) =>
    askItem({
      ref: `ask:${i.toString()}`,
      message: `Question ${i.toString()}?`,
      pausedAt: `2026-11-1${i.toString()}T09:00:00.000Z`,
    })
  ),
  runs: [],
  degraded: [],
};
/** How many ask cards are drawn. */
const cards = (html: string): number => html.split('data-ask=').length - 1;

describe('Needs you', () => {
  test('is the project tab, its count on it; the Factory frame is not around it', () => {
    const html = render(`/console/p/${ID}/needs-you`, withView, sixAsks);
    expect(currentLinks(html)).toEqual([`/console/p/${ID}/needs-you Needs you6`]);
    expect(html).toContain('aria-label="6 waiting"');
    expect(html).toContain('6 things need you');
    expect(html).not.toContain('Issues come in; changes go out.');
  });

  test('lists every ask, where the Overview shows the newest three and says how many more', () => {
    const page = render(`/console/p/${ID}/needs-you`, withView, sixAsks);
    expect(cards(page)).toBe(6);
    for (let i = 0; i < 6; i++) expect(page).toContain(`Question ${i.toString()}?`);

    const overview = render(`/console/p/${ID}/factory`, withView, sixAsks);
    expect(cards(overview)).toBe(3);
    for (const i of [5, 4, 3]) expect(overview).toContain(`Question ${i.toString()}?`);
    expect(overview).toContain('3 more on Needs you');
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

describe('the stage page', () => {
  test("shows the stage's label and blurb, then its workflow's steps framed by loop and include", () => {
    const html = render(`/console/p/${ID}/factory/stages/checks`, withView);
    expect(html).toContain('Checks');
    expect(html).toContain('Checks the change.');
    expect(html).toContain('up to 3 rounds');
    expect(html).toContain('>included<');
    // Only the stage's own step stands out; the rest of deliver is dimmed.
    expect([...html.matchAll(/<button[^>]*data-in-stage=""[^>]*>/g)]).toHaveLength(1);
    expect(html).toMatch(
      /<button[^>]*title="review \(engine id: rounds\.review__review\)"[^>]*data-in-stage=""/
    );
    // And it looks different: the stage's step and another stage's idle step do not share
    // their classes, whatever the classes are.
    const buttons = [...html.matchAll(/<button[^>]*>/g)].map(([tag]) => tag);
    const classOf = (tag: string | undefined): string | undefined =>
      /class="([^"]*)"/.exec(tag ?? '')?.[1];
    const own = buttons.find(tag => tag.includes('data-in-stage=""'));
    const other = buttons.find(
      tag =>
        tag.includes('title=') && !tag.includes('data-in-stage') && !tag.includes('data-running')
    );
    expect(classOf(own)).toBeDefined();
    expect(classOf(other)).toBeDefined();
    expect(classOf(own)).not.toBe(classOf(other));
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

describe('Factory routes', () => {
  const overviewRead: FactoryOverviewRead = {
    overview: {
      pack: 'acme/kit',
      source: 'project-file',
      path: '/repo/.archon/packs/acme.kit.factory-overview.json',
      declaration: OVERVIEW,
    },
    errors: [],
  };

  test('How it works lives at /factory/how-it-works, its tab current', () => {
    set(K.factoryOverview(ID), overviewRead);
    const html = render(`/console/p/${ID}/factory/how-it-works`, withView);
    expect(html).toContain('Work comes in, is made, and is checked.');
    expect(currentLinks(html)).toEqual([
      `/console/p/${ID}/factory Factory`,
      `/console/p/${ID}/factory/how-it-works How it works`,
    ]);
  });

  test('an unknown path stays in the section, says so, and links every page', () => {
    const html = render(`/console/p/${ID}/factory/how-it-work`, withView);
    expect(html).toContain('No page here');
    // The frame is intact: the view's title and the project's tabs still draw.
    expect(html).toContain('Kit factory');
    const start = html.indexOf('aria-label="Factory pages"');
    expect(start).toBeGreaterThan(-1);
    const links = html.slice(start, html.indexOf('</nav>', start));
    for (const rest of ['', '/board', '/how-it-works'])
      expect(links).toContain(`href="/console/p/${ID}/factory${rest}"`);
    expect(links).toContain(`href="/console/p/${ID}/needs-you"`);
  });

  test('an unknown stage or item keeps its own page and message', () => {
    const stage = render(`/console/p/${ID}/factory/stages/nope`, withView);
    expect(stage).toContain('This factory has no stage');
    expect(stage).not.toContain('No page here');
    expect(render(`/console/p/${ID}/factory/items/nope`, withView)).not.toContain('No page here');
  });
});

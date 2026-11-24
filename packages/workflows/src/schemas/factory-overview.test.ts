import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { factoryOverviewSchema, type FactoryOverview } from './factory-overview';

type View = FactoryOverview['views'][string];
type Card = View['cards'][number];

const card = (id: string, col: number, row: number, extra: Partial<Card> = {}): Card => ({
  id,
  title: id,
  text: `The ${id} card.`,
  icon: 'hammer',
  kind: 'stage',
  col,
  row,
  ...extra,
});

/** A root of three cards in a row with a lane from the last back to the middle, and one drill-down. */
function valid(): FactoryOverview {
  return {
    version: 1,
    pack: 'acme/factory',
    title: 'How it works',
    caption: 'Work comes in, gets built, lands.',
    root: 'top',
    views: {
      top: {
        cards: [card('in', 1, 1), card('make', 2, 1, { opens: 'make' }), card('check', 3, 1)],
        edges: [
          { from: 'in', to: 'make', kind: 'feeds' },
          { from: 'make', to: 'check', kind: 'feeds' },
          { from: 'check', to: 'make', kind: 'loops-back', label: 'back' },
        ],
      },
      make: {
        cards: [card('write', 1, 1), card('test', 2, 1)],
        edges: [{ from: 'write', to: 'test', kind: 'feeds' }],
      },
    },
  };
}

/**
 * What `overview` is refused for: each issue's path, then the ids from the input it names (the
 * quoted values in its message), so a test pins the rule and the place, not the wording.
 */
function issues(overview: unknown): string[] {
  const parsed = factoryOverviewSchema.safeParse(overview);
  return (parsed.error?.issues ?? []).map(issue => {
    const named = [...issue.message.matchAll(/"([^"]+)"/g)].map(match => match[1]);
    return [issue.path.join('.'), ...named].join(' ');
  });
}

/** `valid()` changed by `edit`, which changes it in place or returns a replacement. */
function edited(edit: (overview: FactoryOverview) => unknown): unknown {
  const overview = valid();
  return edit(overview) ?? overview;
}

const top = (o: FactoryOverview): View => o.views.top as View;
const make = (o: FactoryOverview): View => o.views.make as View;

const sections = [
  { id: 'held', eyebrow: 'Policies', title: 'Held to', kind: 'stage', icon: 'scale' },
  { id: 'proven', eyebrow: 'Checks', title: 'Proven', kind: 'check', icon: 'flask' },
] as const;
const settings = {
  plan_policy: { points_to: 'policy', section: 'held' },
  checks_file: { points_to: 'checks', shadow: true, section: 'proven', when_live: 'Sends back' },
  validate_command: {},
} as const;
/** An ask from `write` to a person below it, and their reply drawn beside it. */
const asked = (o: FactoryOverview): View => {
  make(o).cards.push(card('you', 1, 2));
  make(o).edges.push(
    { from: 'write', to: 'you', kind: 'calls', label: 'asks' },
    { from: 'you', to: 'write', kind: 'loops-back', label: 'restarts it' }
  );
  return make(o);
};

test('accepts the overview this repository ships, every live-able shadow setting explained', () => {
  const file = join(
    import.meta.dir,
    '../../../../.archon/packs/Wirasm.archon-software-factory.factory-overview.json'
  );
  const overview = JSON.parse(readFileSync(file, 'utf8')) as FactoryOverview;
  expect(issues(overview)).toEqual([]);
  // The Settings page says what changes when a shadow goes live; this file gives every one.
  const unexplained = Object.entries(overview.settings ?? {})
    .filter(([, setting]) => setting.shadow === true && setting.when_live === undefined)
    .map(([name]) => name);
  expect(unexplained).toEqual([]);
});

describe('factoryOverviewSchema accepts', () => {
  test.each<[string, (o: FactoryOverview) => unknown]>([
    ['the valid overview', () => undefined],
    [
      'settings in sections, a shadow saying what it does live',
      o => ({ ...o, setting_sections: sections, settings }),
    ],
    [
      // `check` and `ship` both send work back to `make`; the longer line runs under the shorter.
      'loops-back lines whose spans nest, each on its own track',
      o => {
        top(o).cards.push(card('ship', 4, 1));
        top(o).edges.push(
          { from: 'check', to: 'ship', kind: 'feeds' },
          { from: 'ship', to: 'make', kind: 'loops-back', label: 'again' },
          { from: 'make', to: 'in', kind: 'loops-back', shadow: true }
        );
      },
    ],
    ['a reply to an ask, drawn beside it', o => void asked(o)],
  ])('%s', (_name, edit) => {
    expect(issues(edited(edit))).toEqual([]);
  });
});

describe('factoryOverviewSchema rejects', () => {
  test('an unknown key, so a misspelled field is not silently dropped', () => {
    const parsed = factoryOverviewSchema.safeParse({ ...valid(), captions: 'x' });
    expect(parsed.error?.issues.map(issue => [issue.code, issue.path])).toEqual([
      ['unrecognized_keys', []],
    ]);
  });

  // Each row: what is refused, the change to `valid()`, and its issues. A row marked `some`
  // checks only that its issue is among them: a broken layout often breaks more than one rule.
  test.each<[string, (o: FactoryOverview) => unknown, string[], 'some'?]>([
    [
      'a second checks file',
      o => ({
        ...o,
        settings: { checks_file: { points_to: 'checks' }, more: { points_to: 'checks' } },
      }),
      ['settings.more.points_to more checks_file'],
    ],
    [
      'a key that is no setting name',
      o => ({ ...o, settings: { '1st': { shadow: true } } }),
      ['settings.1st'],
    ],
    [
      'a section listed twice',
      o => ({ ...o, setting_sections: [...sections, sections[0]], settings }),
      ['setting_sections.2.id held'],
    ],
    [
      'a setting in an unknown section',
      o => ({ ...o, setting_sections: sections, settings: { plan_policy: { section: 'gone' } } }),
      ['settings.plan_policy.section gone'],
    ],
    [
      'when_live off a shadow',
      o => ({ ...o, settings: { plan_policy: { when_live: 'Would act' } } }),
      ['settings.plan_policy.when_live'],
    ],
    ['a root that names no view', o => ({ ...o, root: 'nope' }), ['root nope']],
    [
      'an id used twice across views',
      o => void make(o).cards.push(card('in', 3, 1)),
      ['views.make.cards.2.id in'],
    ],
    [
      'opens naming a missing view',
      o => void ((top(o).cards[0] as Card).opens = 'gone'),
      ['views.top.cards.0.opens gone'],
    ],
    [
      'opens naming its own view',
      o => void ((top(o).cards[0] as Card).opens = 'top'),
      ['views.top.cards.0.opens top'],
    ],
    [
      'a view opened twice',
      o => void ((top(o).cards[2] as Card).opens = 'make'),
      ['views.top.cards.2.opens make make'],
    ],
    ['a view no card opens', o => void delete (top(o).cards[1] as Card).opens, ['views.make']],
    [
      'a caption on the root view, whose line is the top-level caption',
      o => void (top(o).caption = 'x'),
      ['views.top.caption'],
    ],
    ['a root without a loops-back edge', o => void top(o).edges.pop(), ['views.top.edges']],
    [
      'the same ask pair joined again',
      o => void asked(o).edges.push({ from: 'you', to: 'write', kind: 'loops-back' }),
      ['views.make.edges.3 you write'],
    ],
    [
      'two cards in one cell',
      o => void (make(o).cards[1] = card('test', 1, 1)),
      ['views.make.cards.1 write'],
      'some',
    ],
    [
      'a card naming an undeclared group',
      o => void ((top(o).cards[0] as Card).group = 'nope'),
      ['views.top.cards.0.group nope'],
    ],
    [
      'an empty group',
      o => void (top(o).groups = [{ id: 'empty', label: 'Empty' }]),
      ['views.top.groups.0 empty'],
    ],
    [
      // A group of `in` and `check` spans column 2, where `make` sits outside it.
      'a group holding a stranger',
      o => {
        top(o).groups = [{ id: 'ends', label: 'Ends' }];
        (top(o).cards[0] as Card).group = 'ends';
        (top(o).cards[2] as Card).group = 'ends';
      },
      ['views.top.groups.0 ends make'],
      'some',
    ],
    [
      'an edge naming nothing',
      o => void make(o).edges.push({ from: 'write', to: 'gone', kind: 'calls' }),
      ['views.make.edges.1.to gone'],
    ],
    [
      'an edge joining a card to itself',
      o => void make(o).edges.push({ from: 'test', to: 'test', kind: 'calls' }),
      ['views.make.edges.1'],
    ],
    [
      'an edge repeating a pair',
      o => void make(o).edges.push({ from: 'test', to: 'write', kind: 'calls' }),
      ['views.make.edges.1 test write'],
    ],
    [
      'a loops-back edge from a group',
      o => {
        top(o).groups = [{ id: 'g', label: 'G' }];
        (top(o).cards[2] as Card).group = 'g';
        top(o).edges[2] = { from: 'g', to: 'make', kind: 'loops-back' };
      },
      ['views.top.edges.2'],
    ],
    // The layout rules, one of each kind: a line must be drawable without crossing.
    [
      // Columns 1 to 3 and 2 to 4 overlap without one holding the other, so they must cross.
      'two loops-back lines whose spans interleave',
      o => {
        top(o).cards.push(card('ship', 4, 1));
        top(o).edges[2] = { from: 'check', to: 'in', kind: 'loops-back' };
        top(o).edges.push({ from: 'ship', to: 'make', kind: 'loops-back' });
      },
      ['views.top.edges.2 ship make'],
    ],
    [
      'an edge whose ends share no row or column',
      o => {
        make(o).cards.push(card('far', 3, 2));
        make(o).edges.push({ from: 'write', to: 'far', kind: 'calls' });
      },
      ['views.make.edges.1'],
    ],
    [
      'an edge that runs through a card',
      o => void top(o).edges.push({ from: 'in', to: 'check', kind: 'calls' }),
      ['views.top.edges.3 make'],
      'some',
    ],
    [
      'a loops-back lane dropping through a card under its source',
      o => void top(o).cards.push(card('under', 3, 2)),
      ['views.top.edges.2 under'],
      'some',
    ],
  ])('%s', (...[_name, edit, expected, some]) => {
    const found = issues(edited(edit));
    if (some === undefined) expect(found).toEqual(expected);
    else expect(found).toEqual(expect.arrayContaining(expected));
  });
});

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

/** The issues `overview` fails with, as `path: message`. */
function issues(overview: unknown): string[] {
  const parsed = factoryOverviewSchema.safeParse(overview);
  return (parsed.error?.issues ?? []).map(issue => `${issue.path.join('.')}: ${issue.message}`);
}

/** `valid()` changed by `edit`. */
function edited(edit: (overview: FactoryOverview) => void): FactoryOverview {
  const overview = valid();
  edit(overview);
  return overview;
}

const top = (overview: FactoryOverview): View => overview.views.top as View;

describe('factoryOverviewSchema', () => {
  test('accepts a valid overview', () => {
    expect(issues(valid())).toEqual([]);
  });

  test('accepts the overview this repository ships', () => {
    const file = join(
      import.meta.dir,
      '../../../../.archon/packs/Wirasm.archon-software-factory.factory-overview.json'
    );
    expect(issues(JSON.parse(readFileSync(file, 'utf8')))).toEqual([]);
  });

  test('rejects an unknown key, so a misspelled field is not silently dropped', () => {
    expect(issues({ ...valid(), captions: 'x' })).toEqual([
      expect.stringContaining('Unrecognized key'),
    ]);
  });

  test('rejects a root that names no view', () => {
    expect(issues({ ...valid(), root: 'nope' })).toEqual([
      'root: names view "nope", which is not in views',
    ]);
  });

  test('rejects an id used twice across views', () => {
    const overview = edited(o => {
      (o.views.make as View).cards.push(card('in', 3, 1));
    });
    expect(issues(overview)).toEqual(['views.make.cards.2.id: id "in" is used twice in this file']);
  });

  test('rejects opens that names a missing view, its own view, or a view opened twice', () => {
    expect(
      issues(
        edited(o => {
          (top(o).cards[0] as Card).opens = 'gone';
        })
      )
    ).toEqual(['views.top.cards.0.opens: names view "gone", which is not in views']);
    expect(
      issues(
        edited(o => {
          (top(o).cards[0] as Card).opens = 'top';
        })
      )
    ).toEqual(['views.top.cards.0.opens: opens "top", which would loop back up the tree']);
    expect(
      issues(
        edited(o => {
          (top(o).cards[2] as Card).opens = 'make';
        })
      )
    ).toEqual(['views.top.cards.2.opens: opens "make", which card "make" opens too']);
  });

  test('rejects a view no card opens', () => {
    const overview = edited(o => {
      delete (top(o).cards[1] as Card).opens;
    });
    expect(issues(overview)).toEqual(['views.make: no card reachable from the root opens it']);
  });

  test('rejects a caption on the root view, whose line is the top-level caption', () => {
    const overview = edited(o => {
      top(o).caption = 'Never shown.';
    });
    expect(issues(overview)).toEqual([
      "views.top.caption: the root view's line is the overview's top-level caption; move it there",
    ]);
  });

  test('rejects a root without a loops-back edge, and two in one view', () => {
    expect(issues(edited(o => void top(o).edges.pop()))).toEqual([
      'views.top.edges: the root view needs its one loops-back edge',
    ]);
    const twice = edited(o => {
      top(o).edges[0] = { from: 'in', to: 'make', kind: 'loops-back' };
    });
    expect(issues(twice)).toContain(
      'views.top.edges: has 2 loops-back edges; a view draws one lane at most'
    );
  });

  test('rejects two cards in one cell', () => {
    const overview = edited(o => {
      (o.views.make as View).cards[1] = card('test', 1, 1);
    });
    expect(issues(overview)).toContain('views.make.cards.1: cell 1,1 already holds card "write"');
  });

  test('rejects a card naming an undeclared group, an empty group, and a group holding a stranger', () => {
    expect(
      issues(
        edited(o => {
          (top(o).cards[0] as Card).group = 'nope';
        })
      )
    ).toEqual(['views.top.cards.0.group: names group "nope", which this view does not declare']);
    expect(
      issues(
        edited(o => {
          top(o).groups = [{ id: 'empty', label: 'Empty' }];
        })
      )
    ).toEqual(['views.top.groups.0: group "empty" holds no card']);
    // A group of `in` and `check` spans column 2, where `make` sits outside it.
    const stranger = edited(o => {
      top(o).groups = [{ id: 'ends', label: 'Ends' }];
      (top(o).cards[0] as Card).group = 'ends';
      (top(o).cards[2] as Card).group = 'ends';
    });
    expect(issues(stranger)).toContain(
      'views.top.groups.0: group "ends" covers card "make", which is not in it'
    );
  });

  test('rejects an edge naming nothing, joining a card to itself, or repeating a pair', () => {
    expect(
      issues(
        edited(o => {
          (o.views.make as View).edges.push({ from: 'write', to: 'gone', kind: 'calls' });
        })
      )
    ).toEqual(['views.make.edges.1.to: names "gone", no card or group of this view']);
    expect(
      issues(
        edited(o => {
          (o.views.make as View).edges.push({ from: 'test', to: 'test', kind: 'calls' });
        })
      )
    ).toEqual(['views.make.edges.1: joins a card to itself']);
    expect(
      issues(
        edited(o => {
          (o.views.make as View).edges.push({ from: 'test', to: 'write', kind: 'calls' });
        })
      )
    ).toEqual(['views.make.edges.1: joins "test" and "write" a second time']);
  });

  test('rejects an edge whose ends share no row or column', () => {
    const overview = edited(o => {
      const make = o.views.make as View;
      make.cards.push(card('far', 3, 2));
      make.edges.push({ from: 'write', to: 'far', kind: 'calls' });
    });
    expect(issues(overview)).toEqual([
      'views.make.edges.1: an edge must share a row or a column with its other end',
    ]);
  });

  test('rejects an edge that runs through a card', () => {
    const overview = edited(o => {
      top(o).edges.push({ from: 'in', to: 'check', kind: 'calls' });
    });
    expect(issues(overview)).toContain(
      'views.top.edges.3: runs through card "make"; move a card so the line has a clear row or column'
    );
  });

  test('rejects an edge that runs through a group holding neither end', () => {
    // `mid` sits in a group in row 1; an edge in row 1 between cards either side of it crosses it.
    const overview = edited(o => {
      const make = o.views.make as View;
      make.groups = [{ id: 'mid', label: 'Mid' }];
      make.cards = [card('write', 1, 1), card('test', 2, 2, { group: 'mid' }), card('ship', 3, 2)];
      make.cards.push(card('top-left', 1, 2));
      make.edges = [{ from: 'top-left', to: 'ship', kind: 'feeds' }];
    });
    expect(issues(overview)).toEqual(
      expect.arrayContaining([
        'views.make.edges.0: runs through card "test"; move a card so the line has a clear row or column',
        'views.make.edges.0: runs through group "mid"; move a card so the line has a clear row or column',
      ])
    );
  });

  test('rejects two lines that cross in an empty cell', () => {
    // A row-2 line from (1,2) to (3,2) and a column-2 line from (2,1) to (2,3) meet at (2,2).
    const overview = edited(o => {
      const make = o.views.make as View;
      make.cards = [card('w', 1, 2), card('e', 3, 2), card('n', 2, 1), card('s', 2, 3)];
      make.edges = [
        { from: 'w', to: 'e', kind: 'feeds' },
        { from: 'n', to: 's', kind: 'calls' },
      ];
    });
    expect(issues(overview)).toEqual([
      'views.make.edges.0: crosses or touches the edge from "n" to "s"',
    ]);
  });

  test('rejects a loops-back lane that would drop through a card under its source', () => {
    const overview = edited(o => {
      top(o).cards.push(card('under', 3, 2));
    });
    expect(issues(overview)).toContain(
      'views.top.edges.2: runs through card "under"; move a card so the line has a clear row or column'
    );
  });

  test('rejects a loops-back edge from a group', () => {
    const overview = edited(o => {
      top(o).groups = [{ id: 'g', label: 'G' }];
      (top(o).cards[2] as Card).group = 'g';
      top(o).edges[2] = { from: 'g', to: 'make', kind: 'loops-back' };
    });
    expect(issues(overview)).toEqual([
      'views.top.edges.2: a loops-back edge joins two cards, not groups',
    ]);
  });
});

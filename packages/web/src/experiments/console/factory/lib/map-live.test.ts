import { describe, expect, test } from 'bun:test';
import type { AttentionQueueItem } from '../../skills/runs';
import { askItem, usageLimitItem } from '../needs-you.test-fixtures';
import { stageLive } from './map-live';
import { itemWith, itemWithoutProgress, realItem, run } from './map.test-fixtures';
import { shippedView } from '../item-detail.test-fixtures';
import { itemColumn, pageRunFacts, placementInput } from './placement';

const view = shippedView;

/** Per stage: [keys here, working, keys needing you]. */
function chips(live: ReturnType<typeof stageLive>): Record<string, [string[], number, string[]]> {
  return Object.fromEntries(
    [...live.stages].map(([stage, entry]) => [
      stage,
      [
        entry.items.map(item => item.item.key),
        entry.working,
        entry.needYou.map(item => item.item.key),
      ],
    ])
  );
}

const askOn = (id: string, key: string): AttentionQueueItem =>
  askItem({ ref: `ask:${key}`, item: { id, projectKey: 'acme', key } });

describe('the live chips on each card', () => {
  test('the seeded items: running ones by their step, idle ones by their last outcome', () => {
    const items = ['6', '5', '4', '3', '8', '7'].map(realItem);
    const live = stageLive(view, items, []);
    expect(chips(live)).toEqual({
      triage: [[], 0, []],
      plan: [[], 0, []],
      build: [['5', '3'], 1, []],
      checks: [['4'], 1, []],
      host: [['6'], 1, []],
      ready: [[], 0, []],
      landed: [['8', '7'], 0, []],
    });
    expect(live.notOnMap).toEqual([]);
  });

  test('which card a running step belongs to', () => {
    const live = stageLive(
      view,
      [
        itemWith('r', [run('deliver', 'running', null, 'rounds.review__review')]),
        itemWith('b', [run('deliver', 'running', null, 'build__build')]),
        itemWith('h', [run('deliver', 'running', null, 'hostrounds.host__host')]),
        itemWith('n', [run('deliver', 'running')]),
      ],
      []
    );
    expect(chips(live).checks).toEqual([['r'], 1, []]);
    expect(chips(live).build).toEqual([['b', 'n'], 2, []]);
    expect(chips(live).host).toEqual([['h'], 1, []]);
  });

  test('an idle ready item is on Ready, not working; a triage ending is on no card', () => {
    const live = stageLive(
      view,
      [
        itemWith('ready', [run('deliver', 'completed', 'ready')]),
        itemWith('skip', [run('triage', 'completed', 'skip')]),
      ],
      []
    );
    expect(chips(live).ready).toEqual([['ready'], 0, []]);
    expect([...live.stages.values()].flatMap(entry => entry.items)).toHaveLength(1);
    expect(live.notOnMap).toEqual([]);
  });

  test('needs you: an open ask on the item, matched by item id; a usage limit is not', () => {
    const asking = itemWith('ask', [run('deliver', 'completed', 'ask')]);
    const limited = itemWith('limit', [run('deliver', 'running', null, 'build__build')]);
    const live = stageLive(
      view,
      [asking, limited],
      [
        askOn(asking.item.id, asking.item.key),
        usageLimitItem({ item: { id: limited.item.id, projectKey: 'acme', key: 'limit' } }),
        // Same key, another item: not this one.
        askOn('other-id', 'limit'),
      ]
    );
    expect(chips(live).build).toEqual([['ask', 'limit'], 1, ['ask']]);
  });

  test('needs you: a wait the item read lists among its questions counts, as on the item page', () => {
    const asking = itemWith('child', [run('deliver', 'completed', 'ask')]);
    // A wait inside a child run: the queue names no item, the item read lists its ref.
    const wait = askItem({ ref: 'ask:child-run', item: undefined });
    asking.questions = [wait];
    expect(chips(stageLive(view, [asking], [wait])).build).toEqual([['child'], 0, ['child']]);
  });

  test("a failed run after a placed completion keeps the completion's card, as on the item page", () => {
    const histories = [
      itemWith('w', [run('deliver', 'completed', 'waiting'), run('deliver', 'failed')]),
      itemWith('p', [run('plan', 'completed', 'planned'), run('triage', 'failed')]),
    ];
    const live = stageLive(view, histories, []);
    expect(chips(live).host).toEqual([['w'], 0, []]);
    expect(chips(live).build).toEqual([['p'], 0, []]);
    // The card is the column the item page computes from the same runs.
    for (const item of histories) {
      const progress = item.progress;
      if (progress === null) throw new Error('fixture has progress');
      const column = itemColumn(view, placementInput(item, pageRunFacts(progress), false));
      const card = [...live.stages].find(([, entry]) => entry.items.includes(item))?.[0];
      expect(column !== null && 'stage' in column ? column.stage.id : null).toBe(card ?? null);
    }
  });

  test('items no card shows are listed with why: no progress, or a stage without a card', () => {
    const noCards = { ...view, map: { ...view.map, cards: [] } };
    const unknown = itemWithoutProgress('z');
    const ready = itemWith('ready', [run('deliver', 'completed', 'ready')]);
    const live = stageLive(noCards, [unknown, ready], []);
    expect(live.notOnMap.map(entry => [entry.item.item.key, entry.why])).toEqual([
      ['z', { kind: 'no-progress' }],
      ['ready', { kind: 'no-card', stage: 'ready' }],
    ]);
    expect(chips(live).ready).toEqual([['ready'], 0, []]);
  });
});

import { describe, expect, test } from 'bun:test';
import type { AttentionQueueItem } from '../../skills/runs';
import { askItem, usageLimitItem } from '../needs-you.test-fixtures';
import { stageLive } from './map-live';
import { endedWith, itemWith, realItem, runningOn, softwareFactory } from './map.test-fixtures';

const view = softwareFactory;

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
    const items = ['5', '8', '6', '3', '7'].map(realItem);
    const live = stageLive(view, items, []);
    expect(chips(live)).toEqual({
      triage: [[], 0, []],
      plan: [[], 0, []],
      build: [['5', '6', '3'], 1, []],
      checks: [['8'], 1, []],
      host: [[], 0, []],
      ready: [[], 0, []],
      landed: [['7'], 0, []],
    });
    expect(live.notOnMap).toEqual([]);
  });

  test('which card a running step belongs to', () => {
    const live = stageLive(
      view,
      [
        itemWith('r', runningOn('deliver', 'rounds.review__review')),
        itemWith('b', runningOn('deliver', 'build__build')),
        itemWith('h', runningOn('deliver', 'hostrounds.host__host')),
        itemWith('n', runningOn('deliver', null)),
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
        itemWith('ready', endedWith('deliver', 'completed', 'ready')),
        itemWith('skip', endedWith('triage', 'completed', 'skip')),
      ],
      []
    );
    expect(chips(live).ready).toEqual([['ready'], 0, []]);
    expect([...live.stages.values()].flatMap(entry => entry.items)).toHaveLength(1);
    expect(live.notOnMap).toEqual([]);
  });

  test('needs you: an open ask on the item, matched by item id; a usage limit is not', () => {
    const asking = itemWith('ask', endedWith('deliver', 'completed', 'ask'));
    const limited = itemWith('limit', runningOn('deliver', 'build__build'));
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

  test('items no card shows are listed with why: no progress, an unlisted workflow, no card', () => {
    const noCards = { ...view, map: { ...view.map, cards: [] } };
    const unknown = itemWith('z', null);
    const stray = itemWith('s', runningOn('mystery-flow', 'a'));
    const ready = itemWith('ready', endedWith('deliver', 'completed', 'ready'));
    const live = stageLive(noCards, [unknown, stray, ready], []);
    expect(live.notOnMap.map(entry => [entry.item.item.key, entry.why])).toEqual([
      ['z', { kind: 'unplaced', reason: 'no-progress' }],
      ['s', { kind: 'unplaced', reason: 'no-stage', workflow: 'mystery-flow' }],
      ['ready', { kind: 'no-card', stage: 'ready' }],
    ]);
    expect(chips(live).ready).toEqual([['ready'], 0, []]);
  });
});

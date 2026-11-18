import { describe, expect, test } from 'bun:test';
import type { FactoryItem } from '../../skills/factory';
import { PAGE, VIEW, realItem } from './board.test-fixtures';
import {
  boardShadowLine,
  cardShadows,
  recentTally,
  shadowOf,
  shadowWords,
  stageHoldsShadow,
  type FactoryShadow,
  type ShadowDecision,
} from './shadows';

type Read = ShadowDecision['read'];

/** A decision as the server reads one, of a shadow the shipped view declares. */
function decision(
  workflow: string,
  node: string,
  read: Read,
  decidedAt = '2026-11-18T12:00:00.000Z',
  round: number | null = null
): ShadowDecision {
  return { workflow, node, round, runId: `run-${workflow}`, decidedAt, read };
}

const verdict = (value: string, why: string | null = null): Read => ({
  reads: 'verdict',
  value,
  why,
});

function shadow(workflow: string, node: string): FactoryShadow {
  const found = shadowOf(VIEW, workflow, node);
  if (found === undefined) throw new Error(`the shipped view declares no ${workflow}/${node}`);
  return found;
}

const passing = (name: string, seconds: number) => ({ name, passed: true, seconds, tail: null });

describe('shadowWords', () => {
  test("a verdict reads through the declaration's words, with its why as the detail", () => {
    const words = shadowWords(
      shadow('landgate', 'gate'),
      decision('landgate', 'gate', verdict('ask', 'Nothing shows the operator looked at it.'))
    );
    expect(words).toEqual({
      line: 'would ask you first',
      mono: false,
      detail: 'Nothing shows the operator looked at it.',
      tally: 'would ask you first',
    });
    expect(
      shadowWords(shadow('triage', 'split'), decision('triage', 'split', verdict('whole'))).line
    ).toBe('would not split it');
    expect(
      shadowWords(shadow('triage', 'admit'), decision('triage', 'admit', verdict('auto'))).line
    ).toBe('would start on its own');
  });

  test('a verdict the words do not name stays the pack token, in mono', () => {
    expect(
      shadowWords(shadow('landgate', 'gate'), decision('landgate', 'gate', verdict('maybe')))
    ).toMatchObject({ line: 'maybe', mono: true });
  });

  test('checks: how many, whether all passed, and how long they took together', () => {
    const read: Read = {
      reads: 'checks',
      results: [
        passing('type-check', 135),
        passing('lint', 56),
        passing('format', 1),
        passing('web tests', 18),
      ],
    };
    expect(
      shadowWords(shadow('deliver', 'rounds.checks'), decision('deliver', 'rounds.checks', read))
    ).toEqual({
      line: '4 checks · all passed · 3 min',
      mono: false,
      detail: null,
      tally: 'all passed',
    });
  });

  test('checks that failed are named, their output the detail', () => {
    const read: Read = {
      reads: 'checks',
      results: [
        { name: 'type-check', passed: false, seconds: 167, tail: 'exited with code 1' },
        { name: 'lint', passed: false, seconds: 1, tail: null },
        passing('format', 2),
      ],
    };
    expect(
      shadowWords(shadow('deliver', 'rounds.checks'), decision('deliver', 'rounds.checks', read))
    ).toEqual({
      line: '3 checks · 2 failed: type-check, lint · 2 min',
      mono: false,
      detail: 'type-check\nexited with code 1',
      tally: '2 failed',
    });
  });

  test('lists: each list with something in it, after its words; nothing reads as such', () => {
    const drain = shadow('discoveries', 'result');
    const read = (counts: number[]): Read => ({ reads: 'lists', counts, why: 'Six reports.' });
    expect(shadowWords(drain, decision('discoveries', 'result', read([1, 3, 0, 2])))).toEqual({
      line: 'would file 1 · would fold into open items 3 · would drop 2',
      mono: false,
      detail: 'Six reports.',
      tally: 'would file 1 · would fold into open items 3 · would drop 2',
    });
    expect(shadowWords(drain, decision('discoveries', 'result', read([0, 0, 0, 0]))).line).toBe(
      'would do nothing'
    );
  });

  test('an unreadable value, or one the declaration now reads otherwise, says so', () => {
    expect(
      shadowWords(shadow('triage', 'admit'), decision('triage', 'admit', { reads: 'unreadable' }))
        .line
    ).toBe('recorded nothing readable');
    expect(
      shadowWords(
        shadow('triage', 'admit'),
        decision('triage', 'admit', { reads: 'lists', counts: [1], why: null })
      ).line
    ).toBe('recorded nothing readable');
  });
});

describe('where the shipped view holds shadows', () => {
  test('a drill-down card covering a shadow step names it; one that does not names none', () => {
    const cards = VIEW.stages.flatMap(stage =>
      (stage.drilldown?.phases ?? []).flatMap(phase => phase.cards)
    );
    const covering = cards.flatMap(card =>
      cardShadows(card, VIEW).map(found => [card.title, found.node])
    );
    expect(covering).toEqual([
      ['Would it start on its own', 'admit'],
      ['Would it be split', 'split'],
      ['Project checks', 'rounds.checks'],
      ['Merge gate', 'gate'],
    ]);
  });

  test('the stages holding one: triage, checks and ready to merge', () => {
    expect(
      VIEW.stages.filter(stage => stageHoldsShadow(stage, VIEW)).map(stage => stage.id)
    ).toEqual(['triage', 'checks', 'ready']);
  });
});

/** An idle real item carrying every shipped shadow's decision. */
function idleWithEveryDecision(): FactoryItem {
  const item = structuredClone(
    PAGE.items.find(entry => entry.progress !== null && entry.progress.running === null)
  );
  if (item?.progress == null) throw new Error('the fixture page has no idle item');
  item.progress.shadows = [
    decision('triage', 'admit', verdict('ask'), '2026-11-18T10:00:00.000Z'),
    decision('triage', 'split', verdict('whole'), '2026-11-18T10:00:00.000Z'),
    decision(
      'deliver',
      'rounds.checks',
      { reads: 'checks', results: [passing('lint', 5)] },
      '2026-11-18T11:00:00.000Z',
      2
    ),
    decision('landgate', 'gate', verdict('ask'), '2026-11-18T12:00:00.000Z'),
    decision(
      'discoveries',
      'result',
      { reads: 'lists', counts: [1, 0, 0, 0], why: null },
      '2026-11-18T12:05:00.000Z'
    ),
  ];
  return item;
}

describe('boardShadowLine', () => {
  test('on the shipped view, only Ready to merge shows a line', () => {
    const item = idleWithEveryDecision();
    const lines = VIEW.stages.map(stage => [
      stage.id,
      boardShadowLine(item, stage, VIEW)?.line ?? null,
    ]);
    expect(lines).toEqual([
      ['order', null],
      ['triage', 'would ask you first'],
      ['plan', null],
      ['build', null],
      ['checks', null],
      ['host', null],
      ['ready', 'would ask you first'],
      ['landed', null],
    ]);
    // So in practice only Ready to merge: an idle item waits in triage only before its triage
    // run decides anything, since no triage outcome places an item back in triage.
    const intoTriage = Object.entries(VIEW.placement).filter(([, stage]) => stage === 'triage');
    expect(intoTriage.map(([key]) => key)).toEqual(['order:ready']);
  });

  test('an item a run works now shows none, nor does one without progress', () => {
    const item = idleWithEveryDecision();
    const ready = VIEW.stages.find(stage => stage.id === 'ready') ?? null;
    if (item.progress === null) throw new Error('unreachable');
    item.progress.running = {
      runId: 'r',
      workflow: 'land',
      step: 'land',
      startedAt: '2026-11-18T13:00:00.000Z',
    };
    expect(boardShadowLine(item, ready, VIEW)).toBeNull();
    expect(boardShadowLine({ ...item, progress: null }, ready, VIEW)).toBeNull();
    expect(boardShadowLine(idleWithEveryDecision(), null, VIEW)).toBeNull();
  });

  test('the newest of the stage’s verdict decisions wins', () => {
    const item = idleWithEveryDecision();
    item.progress?.shadows.push(
      decision('landgate', 'gate', verdict('auto'), '2026-11-18T09:00:00.000Z')
    );
    const ready = VIEW.stages.find(stage => stage.id === 'ready') ?? null;
    expect(boardShadowLine(item, ready, VIEW)?.line).toBe('would ask you first');
  });
});

describe('recentTally', () => {
  const withDecision = (key: string, read: Read, at: string): FactoryItem => {
    const item = realItem(key);
    if (item.progress === null) throw new Error(`fixture item ${key} has no progress`);
    item.progress.shadows = [decision('triage', 'admit', read, at)];
    return item;
  };
  const keys = PAGE.items.filter(item => item.progress !== null).map(item => item.item.key);

  test("counts the newest n items' decisions by what they say", () => {
    const items = keys
      .slice(0, 6)
      .map((key, index) =>
        withDecision(
          key,
          verdict(index === 0 ? 'auto' : 'ask'),
          `2026-11-18T1${index.toString()}:00:00.000Z`
        )
      );
    // The oldest (the one `auto`) falls outside the newest five.
    expect(recentTally(items, shadow('triage', 'admit'))).toBe('last 5: would ask you first ×5');
    expect(recentTally(items, shadow('triage', 'admit'), 6)).toBe(
      'last 6: would ask you first ×5 · would start on its own ×1'
    );
  });

  test('checks count by whether they passed, not by how long they took', () => {
    const items = keys.slice(0, 2).map((key, index) => {
      const item = realItem(key);
      if (item.progress !== null)
        item.progress.shadows = [
          decision('deliver', 'rounds.checks', {
            reads: 'checks',
            results: [passing('lint', 10 + index * 100)],
          }),
        ];
      return item;
    });
    expect(recentTally(items, shadow('deliver', 'rounds.checks'))).toBe('last 2: all passed ×2');
  });

  test('null when no item has a decision of it', () => {
    expect(recentTally(PAGE.items, shadow('landgate', 'gate'))).toBeNull();
  });
});

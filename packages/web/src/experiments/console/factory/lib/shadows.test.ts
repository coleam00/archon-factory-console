import { describe, expect, test } from 'bun:test';
import type { FactoryItem } from '../../skills/factory';
import { endLastRun, keepRuns, PAGE, VIEW, realItem } from './board.test-fixtures';
import {
  boardShadowLine,
  cardShadows,
  recentTally,
  shadowOf,
  shadowWords,
  stageShadowLines,
  stageShadows,
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
  const failing = (name: string, seconds: number, tail: string | null = null) => ({
    name,
    passed: false,
    seconds,
    tail,
  });
  const lists = (counts: number[]): Read => ({ reads: 'lists', counts, why: 'Six reports.' });
  const cases: [string, [string, string], Read, Partial<ReturnType<typeof shadowWords>>][] = [
    [
      "a verdict reads through the declaration's words, its why the detail",
      ['triage', 'admit'],
      verdict('ask', 'Nothing shows the operator looked at it.'),
      {
        line: 'would ask you first',
        mono: false,
        detail: 'Nothing shows the operator looked at it.',
        tally: 'would ask you first',
      },
    ],
    ['another verdict', ['triage', 'admit'], verdict('auto'), { line: 'would start on its own' }],
    [
      'a verdict the words do not name stays the pack token, in mono',
      ['triage', 'admit'],
      verdict('maybe'),
      { line: 'maybe', mono: true },
    ],
    [
      'checks: how many, all passed, how long together',
      ['deliver', 'rounds.checks'],
      {
        reads: 'checks',
        results: [passing('type-check', 135), passing('lint', 56), passing('format', 1)],
      },
      { line: '3 checks · all passed · 3 min', detail: null, tally: 'all passed' },
    ],
    [
      'checks that failed are named, their output the detail',
      ['deliver', 'rounds.checks'],
      {
        reads: 'checks',
        results: [
          failing('type-check', 167, 'exited with code 1'),
          failing('lint', 1),
          passing('format', 2),
        ],
      },
      {
        line: '3 checks · 2 failed: type-check, lint · 2 min',
        detail: 'type-check\nexited with code 1',
        tally: '2 failed',
      },
    ],
    [
      'lists: each list with something in it, after its words',
      ['discoveries', 'result'],
      lists([1, 3, 0, 2]),
      {
        line: 'would file 1 · would fold into open items 3 · would drop 2',
        detail: 'Six reports.',
      },
    ],
    [
      'empty lists read as nothing',
      ['discoveries', 'result'],
      lists([0, 0, 0, 0]),
      {
        line: 'would do nothing',
      },
    ],
    [
      'an unreadable value says so',
      ['triage', 'admit'],
      { reads: 'unreadable' },
      { line: 'recorded nothing readable' },
    ],
    [
      'a value the declaration now reads otherwise says so',
      ['triage', 'admit'],
      { reads: 'lists', counts: [1], why: null },
      { line: 'recorded nothing readable' },
    ],
  ];
  test.each(cases)('%s', (_name, [workflow, node], read, expected) => {
    expect(shadowWords(shadow(workflow, node), decision(workflow, node, read))).toMatchObject(
      expected
    );
  });
});

/** A card standing for one step, as a drill-down of the view would declare it. */
const cardFor = (workflow: string, step: string) => ({
  title: 'Project checks',
  text: "Runs the project's declared checks",
  icon: 'clipboard-list' as const,
  kind: 'script' as const,
  covers: [{ workflow, steps: [step] }],
});

/** `view` with one more phase on its Checks drill-down, holding `card`. */
function withChecksCard(view: typeof VIEW, card: ReturnType<typeof cardFor>): typeof VIEW {
  return {
    ...view,
    stages: view.stages.map(stage =>
      stage.id !== 'checks' || stage.drilldown === undefined
        ? stage
        : {
            ...stage,
            drilldown: {
              ...stage.drilldown,
              phases: [...stage.drilldown.phases, { label: 'Checks', cards: [card] }],
            },
          }
    ),
  };
}

/**
 * The shipped view with a Checks card for deliver's project checks, a shadow step: the card
 * the view drew until the pack retired deliver, and with it the step.
 */
const CHECKS_SHADOWED = withChecksCard(VIEW, cardFor('deliver', 'rounds.checks'));

describe('where the shipped view holds shadows', () => {
  test('a drill-down card covering a shadow step names it; one that does not names none', () => {
    const covering = (view: typeof VIEW) =>
      view.stages
        .flatMap(stage => (stage.drilldown?.phases ?? []).flatMap(phase => phase.cards))
        .flatMap(card => cardShadows(card, view).map(found => [card.title, found.node]));
    // The project checks went with deliver: the shipped Checks stage draws no card for them.
    expect(covering(VIEW)).toEqual([['Would it start on its own', 'admit']]);
    expect(covering(CHECKS_SHADOWED)).toEqual([
      ['Would it start on its own', 'admit'],
      ['Project checks', 'rounds.checks'],
    ]);
  });

  test('the stages holding one: triage alone; the merge gate acts, so it is none', () => {
    expect(
      VIEW.stages.filter(stage => stageShadows(stage, VIEW).length > 0).map(stage => stage.id)
    ).toEqual(['triage']);
  });

  test("the map's lines for a stage: each shadow step's label and what it decided lately", () => {
    const view = CHECKS_SHADOWED;
    const checks = view.stages.find(stage => stage.id === 'checks');
    if (checks === undefined) throw new Error('the shipped view has a checks stage');
    expect(stageShadowLines(checks, view, [idleWithEveryDecision()])).toEqual([
      'Project checks · last 1: all passed ×1',
    ]);
    expect(stageShadowLines(checks, view, [])).toEqual(['Project checks · nothing decided yet']);
    // Before the items are read, or once the read failed, it claims no decision either way.
    expect(stageShadowLines(checks, view, 'loading')).toEqual(['Project checks · …']);
    expect(stageShadowLines(checks, view, 'failed')).toEqual([
      'Project checks · could not be read',
    ]);
    const plan = view.stages.find(stage => stage.id === 'plan');
    if (plan === undefined) throw new Error('the shipped view has a plan stage');
    expect(stageShadowLines(plan, view, [idleWithEveryDecision()])).toEqual([]);
  });
});

/**
 * An idle real item carrying every shipped shadow's decision, and one of the merge gate, which
 * recorded decisions while it was a shadow and is not one now.
 */
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
  test("each stage shows its own workflows' newest verdict decision; others none", () => {
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
      ['ready', null],
      ['landed', null],
    ]);
  });

  test('a triage run that failed after admit decided still shows that line in Triage', () => {
    const real = realItem('5');
    const triageAt = real.runs.findIndex(run => run.workflow.endsWith(':triage'));
    if (triageAt === -1) throw new Error('fixture item 5 has a triage run');
    const item = endLastRun(keepRuns(real, triageAt + 1), 'failed', null, 'admitted');
    if (item.progress === null) throw new Error('unreachable');
    item.progress.shadows = [decision('triage', 'admit', verdict('auto'))];
    // Placement puts it in Triage (placement.test.ts); the line is that stage's decision.
    const triage = VIEW.stages.find(stage => stage.id === 'triage') ?? null;
    expect(boardShadowLine(item, triage, VIEW)?.line).toBe('would start on its own');
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
      decision('triage', 'admit', verdict('auto'), '2026-11-18T09:00:00.000Z')
    );
    const triage = VIEW.stages.find(stage => stage.id === 'triage') ?? null;
    expect(boardShadowLine(item, triage, VIEW)?.line).toBe('would ask you first');
    item.progress?.shadows.push(
      decision('triage', 'admit', verdict('auto'), '2026-11-18T11:00:00.000Z')
    );
    expect(boardShadowLine(item, triage, VIEW)?.line).toBe('would start on its own');
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
    expect(recentTally(items, [shadow('triage', 'admit')])).toBe('last 5: would ask you first ×5');
    expect(recentTally(items, [shadow('triage', 'admit')], 6)).toBe(
      'last 6: would ask you first ×5 · would start on its own ×1'
    );
  });

  test('null when no item has a decision of it', () => {
    expect(recentTally(PAGE.items, [shadow('discoveries', 'result')])).toBeNull();
  });
});

import { describe, expect, test } from 'bun:test';
import type { FactoryItemDetail } from '../../skills/factory';
import { itemDetail, PROJECT, shippedView } from '../item-detail.test-fixtures';
import { buildTimeline, runHref, type TimelineRow } from './timeline';

const NOW = Date.parse('2026-11-17T08:00:00Z');
/** An outcome the declaration words, and a pack token it does not, drawn in mono. */
const said = (text: string) => ({ text, mono: false });
const token = (text: string) => ({ text, mono: true });
const timeline = (detail: FactoryItemDetail, now = NOW): TimelineRow[] =>
  buildTimeline(shippedView, PROJECT, detail, now);

describe('the timeline of an item that landed', () => {
  const detail = itemDetail('1');
  const rows = timeline(detail);

  test('one row per run, in start order, with its stage, workflow and outcome', () => {
    expect(rows.map(row => [row.stage, row.workflow, row.outcome])).toEqual([
      // Each outcome as the declaration's `placement` reads it: where it sent the item.
      ['Triage', 'triage', said('sent to Plan')],
      ['Plan', 'plan', said('sent to Build')],
      ['Build', 'deliver', said('sent to Ready to land')],
    ]);
    expect(rows.map(row => row.runId)).toEqual(detail.item.runs.map(run => run.id));
    expect(rows[0]?.href).toBe(`/console/p/${PROJECT}/r/${detail.item.runs[0]?.id ?? ''}`);
  });

  test('how each run started: a trigger, then after the run before it with its outcome', () => {
    const [triage, plan] = detail.item.runs;
    expect(rows.map(row => row.started)).toEqual([
      { text: 'Started by a trigger', mono: 'fc-start-triage', runHref: null },
      {
        text: 'After Triage: sent to Plan',
        mono: null,
        runHref: runHref(PROJECT, triage?.id ?? ''),
      },
      { text: 'After Plan: sent to Build', mono: null, runHref: runHref(PROJECT, plan?.id ?? '') },
    ]);
  });

  test('duration is end minus start; cost is what the run recorded', () => {
    const [run] = detail.item.runs;
    expect(rows[0]?.durationMs).toBe(
      Date.parse(run?.completedAt ?? '') - Date.parse(run?.startedAt ?? '')
    );
    expect(rows.map(row => row.costUsd)).toEqual(detail.runs.map(run => run.costUsd));
    expect(rows.every(row => row.liveStep === null)).toBe(true);
  });

  test("two rounds: returned with the verdict's summary, then approved", () => {
    const rounds = rows[2]?.rounds ?? [];
    expect(rounds.map(round => [round.iteration, round.max, round.verdict])).toEqual([
      [1, 3, 'returned'],
      [2, 3, 'approved'],
    ]);
    const verdict = detail.runs[2]?.rounds?.rounds[0]?.summary;
    expect(rounds[0]?.returnedSummary).toBe(verdict ?? null);
    expect(rounds[1]?.returnedSummary).toBeNull();
  });
});

describe('the timeline of a multi-round item', () => {
  const rows = timeline(itemDetail('2'));
  const rounds = rows.find(row => row.workflow === 'deliver')?.rounds ?? [];

  test('three rounds: returned, returned, approved', () => {
    expect(rounds.map(round => [round.verdict, round.kind])).toEqual([
      ['returned', 'returned'],
      ['returned', 'returned'],
      ['approved', 'approved'],
    ]);
    expect(rounds.map(round => round.returnedSummary === null)).toEqual([false, false, true]);
  });

  test("a round's steps sit under the stage each belongs to, in recording order", () => {
    const words = (iteration: number) =>
      rounds
        .find(round => round.iteration === iteration)
        ?.groups.map(group => [
          group.label,
          group.steps.map(
            s => `${s.node} ${s.outcome.mono ? `\`${s.outcome.text}\`` : s.outcome.text}`
          ),
        ]);
    // The view declares the verdict's return and approval; the checks' own outcomes it does
    // not, so they stay the pack's tokens.
    expect(words(1)).toEqual([
      [
        'Checks',
        [
          'rounds.tests__tests `return`',
          'rounds.product__product `approve`',
          'rounds.review__review `approve`',
          'rounds.verdict__verdict returned',
        ],
      ],
    ]);
    expect(words(2)?.[0]).toEqual(['Build', ['rounds.fix `fixed`']]);
    expect(words(2)?.[1]?.[0]).toBe('Checks');
  });
});

describe('the timeline of an item asked twice', () => {
  const detail = itemDetail('3');
  const rows = timeline(detail);

  test('both deliver runs, each with its own rounds, ending in an ask', () => {
    const delivers = rows.filter(row => row.workflow === 'deliver');
    expect(delivers.map(row => [row.outcome, row.rounds.map(round => round.verdict)])).toEqual([
      [said('sent to Build'), ['returned', 'needs a decision']],
      [said('sent to Build'), ['returned', 'needs a decision']],
    ]);
    // The second was started again by a trigger, not after the first.
    expect(delivers[1]?.started).toEqual({
      text: 'Started by a trigger',
      mono: 'fc-start-deliver',
      runHref: null,
    });
  });
});

describe('a running run', () => {
  const detail = itemDetail('6');
  const rows = timeline(detail);
  const running = rows.at(-1);

  test('shows its live step, the stage that step is in, and runs until now', () => {
    expect(running?.status).toBe('running');
    expect(running?.outcome).toEqual(said('running'));
    expect(running?.liveStep).toBe('build__build');
    expect(running?.stage).toBe('Build');
    expect(running?.costUsd).toBeNull();
    const started = Date.parse(detail.item.runs.at(-1)?.startedAt ?? '');
    expect(running?.durationMs).toBe(NOW - started);
  });

  test('a step of a later stage moves the row to that stage', () => {
    const later: FactoryItemDetail = {
      ...detail,
      runs: detail.runs.map(run =>
        run.workflow === 'deliver' ? { ...run, step: 'rounds.review__review' } : run
      ),
    };
    expect(timeline(later).at(-1)?.stage).toBe('Checks');
  });
});

describe('how a run started', () => {
  const base = itemDetail('1');
  type Cause = FactoryItemDetail['runs'][number]['cause'];
  const withCause = (cause: Cause, status?: 'pending'): TimelineRow | undefined => {
    const [first, ...rest] = base.item.runs;
    const [facts, ...others] = base.runs;
    if (first === undefined || facts === undefined) return undefined;
    const { cause: _recorded, ...uncaused } = facts;
    const run = status === undefined ? first : { ...first, status };
    return timeline({
      ...base,
      item: { ...base.item, runs: [run, ...rest] },
      runs: [cause === undefined ? uncaused : { ...uncaused, cause }, ...others],
    })[0];
  };

  test('by hand, with no recorded cause', () => {
    expect(withCause(undefined)?.started).toEqual({
      text: 'Started by hand',
      mono: null,
      runHref: null,
    });
  });

  test('after a run that is not on this item', () => {
    expect(
      withCause({ kind: 'run_ended', runId: 'elsewhere', sourceInstanceId: 'fc-start-plan' })
        ?.started
    ).toEqual({
      text: 'After another run',
      mono: null,
      runHref: runHref(PROJECT, 'elsewhere'),
    });
  });

  test('by a step of another run, or by another run that named no step', () => {
    expect(withCause({ kind: 'run_fired', runId: 'r', node: 'start-it' })?.started).toEqual({
      text: 'Started by step',
      mono: 'start-it',
      runHref: runHref(PROJECT, 'r'),
    });
    expect(withCause({ kind: 'run_fired', runId: 'r', node: null })?.started.text).toBe(
      'Started by another run'
    );
  });

  test('a run not yet executing is waiting to start, with no duration', () => {
    const row = withCause(undefined, 'pending');
    expect([row?.outcome, row?.durationMs]).toEqual([said('waiting to start'), null]);
  });

  test("after a run whose outcome the view does not map: the pack's token, in mono", () => {
    const [triage, plan, ...rest] = base.item.runs;
    if (triage === undefined || plan === undefined) throw new Error('item 1 has runs');
    const rows = buildTimeline(
      { ...shippedView, endings: {} },
      PROJECT,
      { ...base, item: { ...base.item, runs: [{ ...triage, outcome: 'skip' }, plan, ...rest] } },
      NOW
    );
    expect(rows[1]?.started).toEqual({
      text: 'After Triage:',
      mono: 'skip',
      runHref: runHref(PROJECT, triage.id),
    });
  });
});

describe('an outcome the declaration says nothing about', () => {
  test("stays the pack's token, drawn as an identifier", () => {
    const detail = itemDetail('1');
    const [triage, ...rest] = detail.item.runs;
    if (triage === undefined) throw new Error('item 1 has runs');
    // No `placement` and no `endings` entry for it.
    const unmapped = { ...shippedView, endings: {} };
    const rows = buildTimeline(
      unmapped,
      PROJECT,
      { ...detail, item: { ...detail.item, runs: [{ ...triage, outcome: 'skip' }, ...rest] } },
      NOW
    );
    expect(rows[0]?.outcome).toEqual(token('skip'));
  });

  test('an ending the declaration labels reads as that label', () => {
    const detail = itemDetail('1');
    const [triage, ...rest] = detail.item.runs;
    if (triage === undefined) throw new Error('item 1 has runs');
    const rows = timeline({
      ...detail,
      item: { ...detail.item, runs: [{ ...triage, outcome: 'skip' }, ...rest] },
    });
    expect(rows[0]?.outcome).toEqual(said(shippedView.endings['triage:*'] ?? ''));
  });
});

describe('a gate that records no outcome', () => {
  test('reads as where `workflow:*` sent the item, as the board places it', () => {
    const detail = itemDetail('1');
    const [triage, ...rest] = detail.item.runs;
    if (triage === undefined) throw new Error('item 1 has runs');
    const gate = { ...triage, id: 'gate', workflow: 'Wirasm/archon-software-factory:landgate' };
    const rows = buildTimeline(
      shippedView,
      PROJECT,
      {
        ...detail,
        item: { ...detail.item, runs: [...rest, { ...gate, outcome: null }] },
        runs: [
          ...detail.runs.slice(1),
          { ...detail.runs[0]!, runId: 'gate', workflow: 'landgate' },
        ],
      },
      NOW
    );
    expect(rows.at(-1)?.outcome).toEqual(said('sent to Ready to land'));
  });
});

describe('round steps in a stage that names no steps', () => {
  test('sit under that stage, as the stage page lists them, not under a catch-all', () => {
    // A view whose deliver stages declare no `nodes` at all: every deliver step is Build's.
    const plain = {
      ...shippedView,
      stages: shippedView.stages.map(stage => {
        const { nodes: _nodes, ...rest } = stage;
        return stage.workflows.includes('deliver') && stage.id !== 'build'
          ? { ...rest, workflows: rest.workflows.filter(w => w !== 'deliver') }
          : rest;
      }),
    };
    const rows = buildTimeline(plain, PROJECT, itemDetail('2'), NOW);
    const labels = rows
      .flatMap(row => row.rounds)
      .flatMap(round => round.groups.map(group => group.label));
    expect(new Set(labels)).toEqual(new Set(['Build']));
  });
});

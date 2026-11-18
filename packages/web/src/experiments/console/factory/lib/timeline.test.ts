import { describe, expect, test } from 'bun:test';
import type { FactoryItemDetail } from '../../skills/factory';
import { itemDetail, PROJECT, shippedView } from '../item-detail.test-fixtures';
import { askItem, gateItem } from '../needs-you.test-fixtures';
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
      { text: 'Started by a trigger', mono: 'fc-start-triage', step: null, runHref: null },
      {
        text: 'After Triage: sent to Plan',
        mono: null,
        step: null,
        runHref: runHref(PROJECT, triage?.id ?? ''),
      },
      {
        text: 'After Plan: sent to Build',
        mono: null,
        step: null,
        runHref: runHref(PROJECT, plan?.id ?? ''),
      },
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
    // The verdict reads through `returns` and `approves`, the checks through `verdicts`, in
    // the board's words. The builder's `fixed` no entry means, so it stays the pack's token.
    expect(words(1)).toEqual([
      [
        'Checks',
        [
          'rounds.tests__tests returned',
          'rounds.product__product approved',
          'rounds.review__review approved',
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
      [said('asked you'), ['returned', 'needs a decision']],
      [said('asked you'), ['returned', 'needs a decision']],
    ]);
    // Each with the question it left, answered since, for the hover.
    const question = (runId: string | undefined) =>
      detail.item.answers.flatMap(a => (a.kind === 'ask' && a.runId === runId ? [a.question] : []));
    expect(delivers.map(row => row.asked)).toEqual(delivers.map(row => question(row.runId)));
    expect(delivers.map(row => row.asked.length)).toEqual([1, 1]);
    // The second was started again by a trigger, not after the first.
    expect(delivers[1]?.started).toEqual({
      text: 'Started by a trigger',
      mono: 'fc-start-deliver',
      step: null,
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
    expect(running?.liveStepName).toBe('Writes the change');
    expect(running?.stage).toBe('Build');
    expect(running?.costUsd).toBeNull();
    const started = Date.parse(detail.item.runs.at(-1)?.startedAt ?? '');
    expect(running?.durationMs).toBe(NOW - started);
  });

  test('a step of a later stage moves the row to that stage', () => {
    const later: FactoryItemDetail = {
      ...detail,
      runs: detail.runs.map(run =>
        run.workflow === 'deliver'
          ? {
              ...run,
              step: 'rounds.review__review',
              rounds: {
                max: 3,
                rounds: [1, 2].map(iteration => ({
                  iteration,
                  verdict: iteration === 1 ? ('returned' as const) : ('running' as const),
                  outcome: null,
                  summary: null,
                  steps: [],
                })),
              },
            }
          : run
      ),
    };
    const row = timeline(later).at(-1);
    expect(row?.stage).toBe('Checks');
    // The live step of the rounds loop reads with the run's latest round.
    expect(row?.liveStepName).toBe('Code review, round 2');
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
      step: null,
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
      step: null,
      runHref: runHref(PROJECT, 'elsewhere'),
    });
  });

  test('by a step of another run, by name, or by another run that named no step', () => {
    const firing = base.runs.find(run => run.workflow === 'deliver')?.runId ?? '';
    const node = 'rounds.verdict__verdict';
    expect(withCause({ kind: 'run_fired', runId: firing, node })?.started).toEqual({
      text: 'Started by step',
      mono: null,
      step: { name: 'Verdict', node },
      runHref: runHref(PROJECT, firing),
    });
    expect(withCause({ kind: 'run_fired', runId: 'r', node: null })?.started.text).toBe(
      'Started by another run'
    );
  });

  test('by a step of a run not on this item: its workflow is unknown, so the step is unnamed', () => {
    expect(withCause({ kind: 'run_fired', runId: 'r', node: 'start-it' })?.started).toEqual({
      text: 'Started by another run',
      mono: null,
      step: null,
      runHref: runHref(PROJECT, 'r'),
    });
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
      step: null,
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

describe('a run that asked', () => {
  const detail = itemDetail('3');
  const deliver = detail.item.runs.find(run => run.outcome === 'ask');
  if (deliver === undefined) throw new Error('item 3 has a deliver run that asked');
  const rowOf = (changed: FactoryItemDetail, view = shippedView) =>
    buildTimeline(view, PROJECT, changed, NOW).find(row => row.runId === deliver.id);
  const withItem = (item: Partial<FactoryItemDetail['item']>): FactoryItemDetail => ({
    ...detail,
    item: { ...detail.item, ...item },
  });
  const noAsks = withItem({ answers: [], questions: [] });

  test('reads "asked you" from a declared `asked` outcome, with no asks recorded', () => {
    expect([rowOf(noAsks)?.outcome, rowOf(noAsks)?.asked]).toEqual([said('asked you'), []]);
    // Without the declaration it reads where `placement` sends it.
    const { asked: _asked, ...undeclared } = shippedView;
    expect(rowOf(noAsks, undeclared)?.outcome).toEqual(said('sent to Build'));
    // `deliver:*` takes every outcome, but not a run that recorded none.
    const anyOutcome = { ...shippedView, asked: ['deliver:*'] };
    expect(rowOf(noAsks, anyOutcome)?.outcome).toEqual(said('asked you'));
    const noOutcome = {
      ...noAsks,
      item: {
        ...noAsks.item,
        runs: noAsks.item.runs.map(run =>
          run.id === deliver.id ? { ...run, outcome: null } : run
        ),
      },
    };
    expect(rowOf(noOutcome, anyOutcome)?.outcome).not.toEqual(said('asked you'));
  });

  test('reads "asked you" over its placement when it left asks on the item', () => {
    const returned = withItem({
      runs: detail.item.runs.map(run =>
        run.id === deliver.id ? { ...run, outcome: 'returned' } : run
      ),
    });
    const row = rowOf(returned);
    expect(row?.outcome).toEqual(said('asked you'));
    expect(row?.asked).toHaveLength(1);
  });

  test("an open ask counts by the run it was asked in, not a gate's own question", () => {
    const placed = noAsks.item.runs.map(run =>
      run.id === deliver.id ? { ...run, outcome: 'returned' } : run
    );
    const message = 'Merge it now?';
    const asked = askItem({ message, askedIn: { runId: deliver.id, workflow: 'deliver' } });
    const gate = askItem({ message, run: { ...gateItem().run, id: deliver.id } });
    const withQuestion = (question: typeof asked) =>
      rowOf({ ...noAsks, item: { ...noAsks.item, runs: placed, questions: [question] } });
    expect([withQuestion(asked)?.outcome, withQuestion(asked)?.asked]).toEqual([
      said('asked you'),
      [message],
    ]);
    expect([withQuestion(gate)?.outcome, withQuestion(gate)?.asked]).toEqual([
      said('sent to Build'),
      [],
    ]);
  });

  test('a run still running reads as running, whatever it later ends with', () => {
    const running = withItem({
      runs: detail.item.runs.map(run =>
        run.id === deliver.id ? { ...run, status: 'running' as const, completedAt: null } : run
      ),
    });
    expect(rowOf(running)?.outcome).toEqual(said('running'));
  });
});

describe('a check outcome no `verdicts` entry means', () => {
  test("stays the pack's token, as does one of a step `verdicts` does not name", () => {
    const detail = itemDetail('2');
    const deliver = detail.runs.find(run => run.workflow === 'deliver');
    const round = deliver?.rounds?.rounds[0];
    if (deliver === undefined || round === undefined) throw new Error('item 2 has rounds');
    const steps = [
      { node: 'rounds.review__review', outcome: 'replan', summary: null },
      { node: 'rounds.verdict__verdict', outcome: 'ask', summary: null },
      { node: 'rounds.base', outcome: 'ask', summary: null },
    ];
    const changed: FactoryItemDetail = {
      ...detail,
      runs: detail.runs.map(run =>
        run === deliver ? { ...run, rounds: { max: 3, rounds: [{ ...round, steps }] } } : run
      ),
    };
    const row = timeline(changed).find(entry => entry.runId === deliver.runId);
    const outcomes = row?.rounds[0]?.groups.flatMap(group => group.steps.map(s => s.outcome));
    expect(outcomes).toEqual([token('replan'), said('asked you'), token('ask')]);
  });
});

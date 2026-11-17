import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  factoryItemProgress,
  factoryItemsPageSchema,
  factoryRunFacts,
  FactoryItemsQueryError,
  FactoryRunFactsMemo,
  factoryItemDetailSchema,
  pageFactoryItems,
  readFactoryItem,
  readFactoryItemsPage,
  type FactoryChangeState,
  type FactoryRound,
  type FactoryListedItem,
} from './factory-items';
import type { ItemReadSource } from './item-read';
import { factoryViewSchema } from './schemas/factory-view';
import { RUN_ENDED_SOURCE_ACTOR } from './schemas/resource-start';
import type { WorkflowEventRow } from './schemas/workflow-event';
import { workflowRunSchema, type WorkflowItem, type WorkflowRun } from './schemas/workflow-run';

const PACK = 'Wirasm/archon-software-factory';
// The declaration this repository ships for the pack the fixtures' runs come from.
const view = factoryViewSchema.parse(
  JSON.parse(
    readFileSync(
      join(
        import.meta.dir,
        '../../../.archon/packs/Wirasm.archon-software-factory.factory-view.json'
      ),
      'utf8'
    )
  )
);

/**
 * Runs copied from the live factory database (see each file's `note`): the run row's
 * recorded fields and its events of the types the facts read, with data trimmed.
 */
function fixture(name: string): { run: WorkflowRun; events: WorkflowEventRow[] } {
  const raw = JSON.parse(
    readFileSync(join(import.meta.dir, '__fixtures__', 'factory-items', `${name}.json`), 'utf8')
  ) as { run: Record<string, unknown> & { started_at: string; completed_at: string | null } };
  return {
    run: hydrate(raw.run),
    events: (raw as unknown as { events: WorkflowEventRow[] }).events,
  };
}

function hydrate(
  fields: Record<string, unknown> & { started_at: string; completed_at: string | null }
): WorkflowRun {
  return workflowRunSchema.parse({
    origin: null,
    conversation_id: null,
    parent_conversation_id: null,
    codebase_id: null,
    outcome: null,
    completed_outcome: null,
    user_message: '',
    active_phase_started_at: null,
    last_activity_at: null,
    working_path: null,
    user_id: null,
    parent_run_id: null,
    adopted_from_run_id: null,
    output_root: null,
    checkout_baseline: null,
    item_id: null,
    metadata: {},
    ...fields,
    started_at: new Date(fields.started_at),
    completed_at: fields.completed_at === null ? null : new Date(fields.completed_at),
  });
}

const triage1 = fixture('item-1-triage-88640c6d');
const plan1 = fixture('item-1-plan-147ff872');
const deliver1 = fixture('item-1-deliver-c90ebf41');
const deliver2 = fixture('item-2-deliver-934682d0');
const deliver2Cut = fixture('item-2-deliver-934682d0-cut');

const factsOf = ({ run, events }: { run: WorkflowRun; events: WorkflowEventRow[] }) =>
  factoryRunFacts(view, PACK, run, events);

/** Each round's verdict and decision: what the board reads of a run's rounds. */
const decisions = (rounds: { max: number | null; rounds: FactoryRound[] } | null | undefined) =>
  rounds === null || rounds === undefined
    ? rounds
    : {
        max: rounds.max,
        rounds: rounds.rounds.map(({ iteration, verdict, outcome }) => ({
          iteration,
          verdict,
          outcome,
        })),
      };

const PR10 = 'https://github.com/coleam00/archon-factory-console/pull/10';
const PR11 = 'https://github.com/coleam00/archon-factory-console/pull/11';

describe('the facts of one run', () => {
  test('a deliver run with two rounds: returned, then approved; one verdict and one host return', () => {
    const facts = factsOf(deliver1);
    expect(facts.active).toBeNull();
    expect(decisions(facts.rounds)).toEqual({
      max: 3,
      rounds: [
        { iteration: 1, verdict: 'returned', outcome: 'return' },
        { iteration: 2, verdict: 'ended', outcome: 'approve' },
      ],
    });
    expect(facts.returnCount).toBe(2);
    expect(facts.change?.url).toBe(PR10);
    expect(facts.change?.audits.length).toBeGreaterThan(0);
  });

  test('a deliver run with three rounds: returned twice, then approved; the host cleared it', () => {
    const facts = factsOf(deliver2);
    expect(facts.rounds?.rounds.map(round => [round.verdict, round.outcome])).toEqual([
      ['returned', 'return'],
      ['returned', 'return'],
      ['ended', 'approve'],
    ]);
    expect(facts.returnCount).toBe(2);
    expect(facts.change?.url).toBe(PR11);
  });

  test('cut mid-round: the deepest step is the latest started of the three parallel checks', () => {
    const facts = factsOf(deliver2Cut);
    // `rounds` and the three checks run at once; the checks are deeper, review started last.
    expect(facts.active).toBe('rounds.review__review');
    expect(decisions(facts.rounds)).toEqual({
      max: 3,
      rounds: [
        { iteration: 1, verdict: 'returned', outcome: 'return' },
        { iteration: 2, verdict: 'running', outcome: null },
      ],
    });
    expect(facts.returnCount).toBe(1);
    // No terminal record yet, so no change at the declared pointer.
    expect(facts.change).toBeNull();
  });

  test('a round that never completed on a run that ended is stopped', () => {
    const facts = factsOf({ ...deliver2Cut, run: { ...deliver2Cut.run, status: 'failed' } });
    expect(facts.rounds?.rounds.at(-1)).toMatchObject({
      iteration: 2,
      verdict: 'stopped',
      outcome: null,
      summary: null,
    });
  });

  test('a round whose checks asked instead of approving ends with that outcome, not an approval', () => {
    // The same run, its verdict step answering `ask` where it approved.
    const events = deliver1.events.map(row =>
      JSON.stringify(row.data).includes('"outcome":"approve"')
        ? (JSON.parse(
            JSON.stringify(row).replaceAll('"outcome":"approve"', '"outcome":"ask"')
          ) as WorkflowEventRow)
        : row
    );
    expect(decisions(factsOf({ ...deliver1, events }).rounds)?.rounds).toEqual([
      { iteration: 1, verdict: 'returned', outcome: 'return' },
      { iteration: 2, verdict: 'ended', outcome: 'ask' },
    ]);
  });

  test("rounds read only the declared loop's events, not another loop's", () => {
    // deliver2 ran three review rounds and one host round.
    const hostView = { ...view, rounds: { workflow: 'deliver', loop: 'hostrounds' } };
    const host = factoryRunFacts(hostView, PACK, deliver2.run, deliver2.events).rounds;
    expect(decisions(host)?.rounds).toEqual([{ iteration: 1, verdict: 'ended', outcome: 'clear' }]);
    expect(host?.rounds[0]?.steps.map(step => step.node)).toEqual(['hostrounds.host__host']);
  });

  test('triage and plan runs have no rounds, returns or change', () => {
    for (const run of [triage1, plan1])
      expect(factsOf(run)).toEqual({ active: null, rounds: null, returnCount: 0, change: null });
  });

  test('a run recorded under the bare name is not the installed pack’s workflow', () => {
    const bare = { ...deliver1, run: { ...deliver1.run, workflow_name: 'deliver' } };
    expect(factsOf(bare)).toMatchObject({ rounds: null, returnCount: 0, change: null });
  });
});

describe("each round's steps", () => {
  const rounds = factsOf(deliver2).rounds?.rounds ?? [];
  const stepsOf = (iteration: number) =>
    rounds
      .find(round => round.iteration === iteration)
      ?.steps.map(step => [step.node, step.outcome]);

  test('a round lists the loop steps that recorded an outcome, in recording order', () => {
    expect(stepsOf(1)).toEqual([
      ['rounds.tests__tests', 'return'],
      ['rounds.product__product', 'approve'],
      ['rounds.review__review', 'approve'],
      ['rounds.verdict__verdict', 'return'],
    ]);
    // Round 1's fix was skipped and the base step records no outcome; neither is a step.
    expect(stepsOf(2)).toEqual([
      ['rounds.fix', 'fixed'],
      ['rounds.tests__tests', 'return'],
      ['rounds.product__product', 'approve'],
      ['rounds.review__review', 'approve'],
      ['rounds.verdict__verdict', 'return'],
    ]);
    expect(stepsOf(3)?.at(-1)).toEqual(['rounds.verdict__verdict', 'approve']);
  });

  test("a round's summary is the summary of the return-point step that decided it", () => {
    const verdictSummary = (iteration: number) =>
      rounds
        .find(round => round.iteration === iteration)
        ?.steps.find(step => step.node === 'rounds.verdict__verdict')?.summary;
    for (const round of rounds) {
      expect(round.summary).toBeString();
      expect(round.summary).toBe(verdictSummary(round.iteration) ?? null);
    }
    expect(rounds[0]?.summary).toStartWith('Return.');
    expect(rounds[2]?.summary).toStartWith('Approve');
  });

  test('a summary that is not a string reads as null, the step still listed', () => {
    const events = deliver2.events.map(row =>
      row.step_name === 'rounds.fix' && JSON.stringify(row.data).includes('"summary"')
        ? (JSON.parse(
            JSON.stringify(row).replace(/"summary":"[^"]*"/, '"summary":7')
          ) as WorkflowEventRow)
        : row
    );
    const fix = factsOf({ ...deliver2, events }).rounds?.rounds[1]?.steps[0];
    expect(fix).toEqual({ node: 'rounds.fix', outcome: 'fixed', summary: null });
  });
});

const notMerged: FactoryChangeState = async () => ({ merged: false, mergedAt: null });

async function progressOf(
  runs: { run: WorkflowRun; events: WorkflowEventRow[] }[],
  changeState: FactoryChangeState = notMerged
) {
  const facts = new Map(runs.map(entry => [entry.run.id, factsOf(entry)]));
  return factoryItemProgress(
    view,
    PACK,
    runs.map(entry => entry.run),
    facts,
    changeState
  );
}

describe("an item's progress", () => {
  test('item 1 after its deliver run: title, round 2 of 3, returned twice, its change', async () => {
    const seen: [string, number][] = [];
    const progress = await progressOf([triage1, plan1, deliver1], async (url, audits) => {
      seen.push([url, audits.length]);
      return { merged: true, mergedAt: '2026-11-17T01:00:00Z' };
    });
    expect(progress).toEqual({
      title: 'The live-home guard and dev:console have tests',
      running: null,
      ended: {
        runId: deliver1.run.id,
        workflow: 'deliver',
        status: 'completed',
        outcome: 'ready',
        completedAt: deliver1.run.completed_at?.toISOString() ?? null,
      },
      round: {
        runId: deliver1.run.id,
        iteration: 2,
        max: 3,
        rounds: [
          { iteration: 1, verdict: 'returned', outcome: 'return' },
          { iteration: 2, verdict: 'ended', outcome: 'approve' },
        ],
      },
      returned: 2,
      change: { url: PR10, merged: true, mergedAt: '2026-11-17T01:00:00Z' },
    });
    expect(seen).toEqual([[PR10, factsOf(deliver1).change?.audits.length ?? -1]]);
  });

  test('returned counts every run that sent the item back; round and change are the latest run', async () => {
    const later = { ...deliver2.run, started_at: new Date('2027-01-01T00:00:00Z') };
    const progress = await progressOf([deliver1, { ...deliver2, run: later }]);
    // Two returns on each deliver run.
    expect(progress.returned).toBe(4);
    expect(progress.round?.runId).toBe(deliver2.run.id);
    expect(progress.change?.url).toBe(PR11);
  });

  test('a running deliver run: its declared workflow name and running step', async () => {
    const progress = await progressOf([deliver2Cut]);
    expect(progress.running).toEqual({
      runId: deliver2Cut.run.id,
      workflow: 'deliver',
      step: 'rounds.review__review',
      startedAt: deliver2Cut.run.started_at.toISOString(),
    });
    expect(progress.round?.iteration).toBe(2);
    expect(progress.change).toBeNull();
  });

  test('ended is the latest-started declared run that ended, failed or cancelled too', async () => {
    const failed = {
      ...deliver1,
      run: { ...deliver1.run, status: 'failed' as const, completed_outcome: null },
    };
    const progress = await progressOf([triage1, plan1, failed]);
    expect(progress.ended).toMatchObject({ runId: failed.run.id, status: 'failed', outcome: null });
  });

  test('a run going after an ended one: running is the live run, ended the one before', async () => {
    const progress = await progressOf([plan1, deliver2Cut]);
    expect(progress.running?.runId).toBe(deliver2Cut.run.id);
    expect(progress.ended).toMatchObject({
      runId: plan1.run.id,
      workflow: 'plan',
      status: 'completed',
      outcome: 'planned',
    });
  });

  test('no declared run has ended: ended is null', async () => {
    expect((await progressOf([deliver2Cut])).ended).toBeNull();
    expect((await progressOf([])).ended).toBeNull();
  });

  test('an item with only triage and plan: nothing returned, no round, no change', async () => {
    const progress = await progressOf([triage1, plan1]);
    expect(progress).toMatchObject({ running: null, round: null, returned: 0, change: null });
    expect(progress.title).toBe('The live-home guard and dev:console have tests');
  });
});

describe('paging items', () => {
  const at = (id: string, activityAt: string): FactoryListedItem => ({
    id,
    key: id,
    activityAt,
  });
  // SQLite records to the second, so `b` and `c` tie and fall back to id order.
  const listed = [
    at('a', '2026-11-16T10:00:00.000Z'),
    at('c', '2026-11-16T12:00:00.000Z'),
    at('b', '2026-11-16T12:00:00.000Z'),
    at('d', '2026-11-16T11:00:00.000Z'),
  ];
  const now = new Date('2026-11-16T13:00:00.000Z');

  test('newest activity first, ties by id; next continues where the page ended', () => {
    const first = pageFactoryItems(listed, { limit: 2 }, 'cb', now);
    expect(first.items.map(item => item.id)).toEqual(['b', 'c']);
    expect(first.next).not.toBeNull();
    const second = pageFactoryItems(listed, { limit: 2, after: first.next! }, 'cb', now);
    expect(second.items.map(item => item.id)).toEqual(['d', 'a']);
    expect(second.next).toBeNull();
  });

  test('since keeps items active at or after it, and the cursor carries it', () => {
    const first = pageFactoryItems(listed, { since: '2h', limit: 1 }, 'cb', now);
    expect(first.items.map(item => item.id)).toEqual(['b']);
    const rest = pageFactoryItems(listed, { after: first.next! }, 'cb', now);
    expect(rest.items.map(item => item.id)).toEqual(['c', 'd']);
  });

  test('refuses a malformed cursor, one for another project, one beside since, and a bad since', () => {
    const { next } = pageFactoryItems(listed, { limit: 1 }, 'cb', now);
    const refusals = [
      () => pageFactoryItems(listed, { after: 'not-a-cursor' }, 'cb', now),
      () => pageFactoryItems(listed, { after: next! }, 'other', now),
      () => pageFactoryItems(listed, { after: next!, since: '1d' }, 'cb', now),
      () => pageFactoryItems(listed, { since: 'yesterday' }, 'cb', now),
    ];
    for (const refusal of refusals) expect(refusal).toThrow(FactoryItemsQueryError);
  });
});

describe('the facts memo', () => {
  test('keeps an ended run, never a running one, and forgets a run that ended again', () => {
    const memo = new FactoryRunFactsMemo();
    const facts = factsOf(deliver1);
    memo.set(view, PACK, deliver1.run, facts);
    expect(memo.get(view, PACK, deliver1.run)).toBe(facts);
    memo.set(view, PACK, deliver2Cut.run, factsOf(deliver2Cut));
    expect(memo.get(view, PACK, deliver2Cut.run)).toBeUndefined();
    const resumed = { ...deliver1.run, completed_at: new Date('2026-11-18T00:00:00Z') };
    expect(memo.get(view, PACK, resumed)).toBeUndefined();
  });

  test('forgets facts read under a declaration that has since changed', () => {
    const memo = new FactoryRunFactsMemo();
    memo.set(view, PACK, deliver1.run, factsOf(deliver1));
    const edited = { ...view, returns: [] };
    expect(memo.get(edited, PACK, deliver1.run)).toBeUndefined();
    expect(factoryRunFacts(edited, PACK, deliver1.run, deliver1.events).returnCount).toBe(0);
  });

  test('is bounded, oldest out', () => {
    const memo = new FactoryRunFactsMemo(1);
    memo.set(view, PACK, deliver1.run, factsOf(deliver1));
    memo.set(view, PACK, deliver2.run, factsOf(deliver2));
    expect(memo.get(view, PACK, deliver1.run)).toBeUndefined();
    expect(memo.get(view, PACK, deliver2.run)).toBeDefined();
  });
});

describe('reading a page', () => {
  const item1: WorkflowItem = { id: 'item-1', projectKey: 'acme/web', key: '1' };
  const item2: WorkflowItem = { id: 'item-2', projectKey: 'acme/web', key: '2' };
  const own = (item: WorkflowItem, ...runs: { run: WorkflowRun }[]): WorkflowRun[] =>
    runs.map(entry => ({ ...entry.run, item_id: item.id }));
  const runsOf: Record<string, WorkflowRun[]> = {
    // The fixtures' metadata is trimmed; real runs record their cost under this key.
    '1': own(item1, triage1, plan1, {
      run: { ...deliver1.run, metadata: { ...deliver1.run.metadata, total_cost_usd: 13.5 } },
    }),
    '2': own(item2, deliver2Cut),
  };
  const all = [triage1, plan1, deliver1, deliver2Cut];

  function pageSource(counts: { queue: number; loaded: string[][] }, broken?: string) {
    const source: ItemReadSource = {
      branchOf: async () => null,
      store: {
        getItemRuns: async (_projectKey, key) => {
          const item = key === '1' ? item1 : key === '2' ? item2 : null;
          return item === null ? null : { item, runs: runsOf[key] ?? [], descendantIds: [] };
        },
        listEventsForRuns: async (ids, types) => {
          // The item read asks for answers too; count only the facts' reads.
          if (types.includes('loop_iteration_started')) counts.loaded.push([...ids]);
          return new Map(
            ids.map(id => {
              const events = all.find(entry => entry.run.id === id)?.events ?? [];
              // A row the node fold refuses, so this run's facts cannot be derived.
              const bad = { ...events[0]!, step_name: 'x', data: { node: 'broken' } };
              return [id, id === broken ? [bad as WorkflowEventRow] : events];
            })
          );
        },
        listAttentionQueueRows: async () => {
          counts.queue++;
          return [];
        },
        getWorkflowRun: async () => null,
        getWorkflowRunForAttention: async () => null,
        getCodebase: async () => null,
        getItem: async () => null,
        listItemAsks: async () => [],
        listItemRulings: async () => [],
        listItemLinks: async () => [],
        getResourceStartRequest: async () => null,
        getStartReceipt: async () => null,
      },
    };
    return source;
  }

  const listing = async (): Promise<FactoryListedItem[]> => [
    { id: item1.id, key: '1', activityAt: '2026-11-17T00:01:56.000Z' },
    { id: item2.id, key: '2', activityAt: '2026-11-17T03:00:00.000Z' },
  ];

  test('reads the queue once, memoises ended runs, and shapes the page', async () => {
    const counts = { queue: 0, loaded: [] as string[][] };
    const memo = new FactoryRunFactsMemo();
    const input = {
      view,
      pack: PACK,
      projectKey: 'acme/web',
      codebaseId: 'cb',
      query: {},
      listProjectItems: listing,
      changeState: notMerged,
      memo,
      onProgressError: (id: string, error: unknown) => {
        throw new Error(`unexpected failure for ${id}: ${String(error)}`);
      },
    };
    const page = factoryItemsPageSchema.parse(
      await readFactoryItemsPage(pageSource(counts), input)
    );
    expect(
      page.items.map(entry => [entry.item.key, entry.progress?.running?.step ?? null])
    ).toEqual([
      ['2', 'rounds.review__review'],
      ['1', null],
    ]);
    expect(page.items[1]?.progress?.change?.url).toBe(PR10);
    expect(page.next).toBeNull();
    expect(counts.queue).toBe(1);
    await readFactoryItemsPage(pageSource(counts), input);
    // The second read loads only the running run; the ended ones were memoised.
    expect(counts.loaded.at(-1)).toEqual([deliver2Cut.run.id]);
  });

  test("one item's facts failing gives it no progress and leaves the page", async () => {
    const failed: string[] = [];
    const page = await readFactoryItemsPage(
      pageSource({ queue: 0, loaded: [] }, deliver2Cut.run.id),
      {
        view,
        pack: PACK,
        projectKey: 'acme/web',
        codebaseId: 'cb',
        query: {},
        listProjectItems: listing,
        changeState: notMerged,
        memo: new FactoryRunFactsMemo(),
        onProgressError: id => failed.push(id),
      }
    );
    expect(page.items.map(entry => [entry.item.key, entry.progress === null])).toEqual([
      ['2', true],
      ['1', false],
    ]);
    expect(failed).toEqual([item2.id]);
  });
  const itemInput = (onProgressError: (id: string, error: unknown) => void) => ({
    view,
    pack: PACK,
    projectKey: 'acme/web',
    changeState: notMerged,
    memo: new FactoryRunFactsMemo(),
    onProgressError,
  });
  const unexpected = (id: string, error: unknown) => {
    throw new Error(`unexpected failure for ${id}: ${String(error)}`);
  };

  test("one item: its read and progress, as a page has them, plus each run's timeline facts", async () => {
    const counts = { queue: 0, loaded: [] as string[][] };
    const detail = factoryItemDetailSchema.parse(
      await readFactoryItem(pageSource(counts), itemInput(unexpected), '1')
    );
    expect(detail.pack).toBe(PACK);
    expect(detail.item.runs.map(run => run.id)).toEqual(detail.runs.map(run => run.runId));
    expect(detail.runs.map(run => [run.workflow, run.costUsd, run.step])).toEqual([
      ['triage', null, null],
      ['plan', null, null],
      ['deliver', 13.5, null],
    ]);
    expect(detail.runs.map(run => run.rounds?.rounds.length ?? null)).toEqual([null, null, 2]);
    expect(detail.item.progress?.change?.url).toBe(PR10);
    expect(counts.queue).toBe(1);
  });

  test("the latest deliver run's rounds are the board's rounds, steps aside", async () => {
    const detail = await readFactoryItem(
      pageSource({ queue: 0, loaded: [] }),
      itemInput(unexpected),
      '1'
    );
    const deliver = detail?.runs.find(run => run.runId === detail.item.progress?.round?.runId);
    expect(decisions(deliver?.rounds)?.rounds).toEqual(detail?.item.progress?.round?.rounds);
    // The board's contract carries no steps or summaries.
    expect(Object.keys(detail?.item.progress?.round?.rounds[0] ?? {}).sort()).toEqual([
      'iteration',
      'outcome',
      'verdict',
    ]);
  });

  test('a running run shows its running step; one with no recorded cost reads null', async () => {
    const detail = await readFactoryItem(
      pageSource({ queue: 0, loaded: [] }),
      itemInput(unexpected),
      '2'
    );
    expect(detail?.runs).toEqual([
      {
        runId: deliver2Cut.run.id,
        workflow: 'deliver',
        costUsd: null,
        step: 'rounds.review__review',
        rounds: factsOf(deliver2Cut).rounds,
      },
    ]);
  });

  test('a run whose facts fail keeps its row without rounds; the item has no progress', async () => {
    const failed: string[] = [];
    const detail = await readFactoryItem(
      pageSource({ queue: 0, loaded: [] }, deliver2Cut.run.id),
      itemInput(id => failed.push(id)),
      '2'
    );
    expect(detail?.runs.map(run => [run.runId, run.step, run.rounds])).toEqual([
      [deliver2Cut.run.id, null, null],
    ]);
    expect(detail?.item.progress).toBeNull();
    expect(failed).toEqual([item2.id]);
  });

  test("each run carries the item read's cause, typed; a start by hand has none", async () => {
    const receiptId = '3b184b44-b90a-4d4c-b205-15755501533d';
    const source = pageSource({ queue: 0, loaded: [] });
    const [triage, plan, deliver] = runsOf['1'] ?? [];
    if (triage === undefined || plan === undefined || deliver === undefined)
      throw new Error('item 1 has three runs');
    const planAfterTriage = {
      ...plan,
      metadata: { ...plan.metadata, resource_start: { receiptId, bindingId: 'b' } },
    };
    source.store.getItemRuns = async () => ({
      item: item1,
      runs: [triage, planAfterTriage, deliver],
      descendantIds: [],
    });
    source.store.getStartReceipt = async id =>
      id === receiptId
        ? ({
            id,
            sourceInstanceId: 'fc-start-plan',
            sourceActor: { source: RUN_ENDED_SOURCE_ACTOR, id: triage.id },
          } as Awaited<ReturnType<ItemReadSource['store']['getStartReceipt']>>)
        : null;
    const detail = await readFactoryItem(source, itemInput(unexpected), '1');
    expect(detail?.runs.map(run => run.cause ?? null)).toEqual([
      null,
      { kind: 'run_ended', runId: triage.id },
      null,
    ]);
    expect(detail?.runs.map(run => run.cause ?? null)).toEqual(
      detail?.item.runs.map(run => run.cause)
    );
    expect(Object.hasOwn(detail?.runs[0] ?? {}, 'cause')).toBe(false);
  });

  test('an unknown key reads null', async () => {
    const source = pageSource({ queue: 0, loaded: [] });
    expect(await readFactoryItem(source, itemInput(unexpected), '404')).toBeNull();
  });
});

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  factoryItemProgress,
  factoryItemsPageSchema,
  factoryRunFacts,
  FactoryItemsQueryError,
  FactoryRunFactsMemo,
  pageFactoryItems,
  readFactoryItemsPage,
  type FactoryChangeState,
  type FactoryListedItem,
} from './factory-items';
import type { ItemReadSource } from './item-read';
import { factoryViewSchema } from './schemas/factory-view';
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

const PR10 = 'https://github.com/coleam00/archon-factory-console/pull/10';
const PR11 = 'https://github.com/coleam00/archon-factory-console/pull/11';

describe('the facts of one run', () => {
  test('a deliver run with two rounds: returned, then approved; one verdict and one host return', () => {
    const facts = factsOf(deliver1);
    expect(facts.active).toBeNull();
    expect(facts.rounds).toEqual({
      max: 3,
      rounds: [
        { iteration: 1, verdict: 'returned', outcome: 'return' },
        { iteration: 2, verdict: 'approved', outcome: 'approve' },
      ],
    });
    expect(facts.returnCount).toBe(2);
    expect(facts.failedStep).toBeNull();
    expect(facts.change?.url).toBe(PR10);
    expect(facts.change?.audits.length).toBeGreaterThan(0);
  });

  test('a deliver run with three rounds: returned twice, then approved; the host cleared it', () => {
    const facts = factsOf(deliver2);
    expect(facts.rounds?.rounds.map(round => [round.verdict, round.outcome])).toEqual([
      ['returned', 'return'],
      ['returned', 'return'],
      ['approved', 'approve'],
    ]);
    expect(facts.returnCount).toBe(2);
    expect(facts.change?.url).toBe(PR11);
  });

  test('cut mid-round: the deepest step is the latest started of the three parallel checks', () => {
    const facts = factsOf(deliver2Cut);
    // `rounds` and the three checks run at once; the checks are deeper, review started last.
    expect(facts.active).toBe('rounds.review__review');
    expect(facts.rounds).toEqual({
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
    expect(facts.rounds?.rounds.at(-1)).toEqual({
      iteration: 2,
      verdict: 'stopped',
      outcome: null,
    });
  });

  test('a round whose checks asked instead of approving needs a decision, with that outcome', () => {
    // The same run, its verdict step answering `ask` where it approved.
    const events = deliver1.events.map(row =>
      JSON.stringify(row.data).includes('"outcome":"approve"')
        ? (JSON.parse(
            JSON.stringify(row).replaceAll('"outcome":"approve"', '"outcome":"ask"')
          ) as WorkflowEventRow)
        : row
    );
    expect(factsOf({ ...deliver1, events }).rounds?.rounds).toEqual([
      { iteration: 1, verdict: 'returned', outcome: 'return' },
      { iteration: 2, verdict: 'undecided', outcome: 'ask' },
    ]);
  });

  test('without a declared approval, a completed round needs a decision, never approved', () => {
    const { approves: _approves, ...undeclared } = view;
    expect(factoryRunFacts(undeclared, PACK, deliver1.run, deliver1.events).rounds?.rounds).toEqual(
      [
        { iteration: 1, verdict: 'returned', outcome: 'return' },
        { iteration: 2, verdict: 'undecided', outcome: 'approve' },
      ]
    );
  });

  test('an approval reads from the outcome the view declares, whatever the workflow calls it', () => {
    // Declared as `pass`, the verdict step's `approve` approves nothing.
    const renamed = {
      ...view,
      approves: (view.approves ?? []).map(point => ({ ...point, outcome: 'pass' })),
    };
    expect(
      factoryRunFacts(renamed, PACK, deliver1.run, deliver1.events).rounds?.rounds.at(-1)?.verdict
    ).toBe('undecided');
  });

  test("rounds read only the declared loop's events, not another loop's", () => {
    // deliver2 ran three review rounds and one host round; the view declares no host approval.
    const hostView = { ...view, rounds: { workflow: 'deliver', loop: 'hostrounds' } };
    expect(factoryRunFacts(hostView, PACK, deliver2.run, deliver2.events).rounds?.rounds).toEqual([
      { iteration: 1, verdict: 'undecided', outcome: 'clear' },
    ]);
  });

  test('a failed run names the step that failed', () => {
    const started = [...deliver2Cut.events]
      .reverse()
      .find(row => row.event_type === 'node_started' && row.step_name === 'rounds.review__review');
    if (started === undefined) throw new Error('the cut fixture starts the review step');
    const failed: WorkflowEventRow = {
      ...started,
      id: 'failed-review',
      event_type: 'node_failed',
      data: { ...started.data, error: 'boom' },
      event_order: (started.event_order ?? 0) + 1000,
    };
    const facts = factsOf({
      run: { ...deliver2Cut.run, status: 'failed' },
      events: [...deliver2Cut.events, failed],
    });
    expect(facts.failedStep).toBe('rounds.review__review');
  });

  test('triage and plan runs have no rounds, returns or change', () => {
    for (const run of [triage1, plan1])
      expect(factsOf(run)).toEqual({
        active: null,
        rounds: null,
        returnCount: 0,
        failedStep: null,
        change: null,
      });
  });

  test('a run recorded under the bare name is not the installed pack’s workflow', () => {
    const bare = { ...deliver1, run: { ...deliver1.run, workflow_name: 'deliver' } };
    expect(factsOf(bare)).toMatchObject({ rounds: null, returnCount: 0, change: null });
  });
});

const notMerged: FactoryChangeState = async () => ({ merged: false, mergedAt: null, number: null });

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
      return { merged: true, mergedAt: '2026-11-17T01:00:00Z', number: 10 };
    });
    expect(progress).toEqual({
      title: 'The live-home guard and dev:console have tests',
      running: null,
      round: {
        runId: deliver1.run.id,
        iteration: 2,
        max: 3,
        rounds: [
          { iteration: 1, verdict: 'returned', outcome: 'return' },
          { iteration: 2, verdict: 'approved', outcome: 'approve' },
        ],
      },
      returned: 2,
      change: { url: PR10, merged: true, mergedAt: '2026-11-17T01:00:00Z', number: 10 },
      // As the view declares each workflow, not as the runs record `owner/name:workflow`.
      runs: [
        { runId: triage1.run.id, workflow: 'triage', failedStep: null },
        { runId: plan1.run.id, workflow: 'plan', failedStep: null },
        { runId: deliver1.run.id, workflow: 'deliver', failedStep: null },
      ],
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
    // An approval declared or withdrawn changes the rounds' verdicts too.
    expect(memo.get({ ...view, approves: [] }, PACK, deliver1.run)).toBeUndefined();
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
    '1': own(item1, triage1, plan1, deliver1),
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
});

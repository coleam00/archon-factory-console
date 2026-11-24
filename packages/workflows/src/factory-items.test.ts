import { describe, expect, test } from 'bun:test';
import {
  factoryItemProgress,
  factoryProgressSchema,
  factoryRunFacts,
  FactoryRunFactsMemo,
  factoryItemDetailSchema,
  readFactoryItem,
  readFactoryProgress,
  type FactoryChangeLookup,
  type FactoryChangeRecord,
  type FactoryChangeState,
  type FactoryRound,
  titleOfItemText,
} from './factory-items';
import { factoryRunStory } from './factory-item-story';
import { PACK, runFixture, shippedView, type RunFixture } from './factory-test.test-helpers';
import type { ItemReadSource } from './item-read';
import { RUN_ENDED_SOURCE_ACTOR } from './schemas/resource-start';
import type { WorkflowEventRow } from './schemas/workflow-event';
import type { WorkflowItem, WorkflowRun } from './schemas/workflow-run';

const view = shippedView();
const fixture = (name: string): RunFixture => runFixture('factory-items', name);

const triage1 = fixture('item-1-triage-88640c6d');
const plan1 = fixture('item-1-plan-147ff872');
const deliver1 = fixture('item-1-deliver-c90ebf41');
const deliver2 = fixture('item-2-deliver-934682d0');
/** The same run as it stood mid-round: its events up to order 1800, and the run still going. */
const deliver2Cut: RunFixture = {
  run: { ...deliver2.run, status: 'running', completed_outcome: null, completed_at: null },
  events: deliver2.events.filter(row => (row.event_order ?? Infinity) <= 1800),
};

/** A discoveries drain of item #70, as the shadow reader's tests copy it. */
function drainFixture(): RunFixture {
  const raw = runFixture('factory-shadows', 'item-70-discoveries');
  // The shadow reader's copy trimmed each event's time; the item read's step starts need one.
  const events = raw.events.map(row => ({
    ...row,
    created_at: row.created_at ?? raw.run.started_at.toISOString(),
  }));
  return { run: { ...raw.run, last_activity_at: null }, events };
}

const factsOf = ({ run, events }: RunFixture) => factoryRunFacts(view, PACK, run, events);

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
const PR12 = 'https://github.com/coleam00/archon-factory-console/pull/12';

/**
 * `entry` as run `id` started at `at`, its result's value rewritten by `value` and its row by
 * `run`: how an order, triage or deliver run records what it decided.
 */
function resulting(
  entry: RunFixture,
  id: string,
  at: string,
  value: (old: Record<string, unknown>) => Record<string, unknown>,
  run: Partial<WorkflowRun> = {}
): RunFixture {
  const events = entry.events.map(row => {
    if (row.event_type !== 'workflow_completed') return row;
    const data = row.data as {
      terminal_record: { returns: { value?: Record<string, unknown> } & Record<string, unknown> };
    };
    const returns = data.terminal_record.returns;
    return {
      ...row,
      workflow_run_id: id,
      data: {
        ...data,
        terminal_record: {
          ...data.terminal_record,
          returns: { ...returns, value: value(returns.value ?? {}) },
        },
      },
    };
  });
  return { run: { ...entry.run, id, started_at: new Date(at), ...run }, events };
}

/** An order run whose result names `partOf` at the pointer the view declares. */
const orderRun = (
  id: string,
  partOf: unknown,
  at: string,
  status: WorkflowRun['status'] = 'completed',
  outcome = 'ready'
) =>
  resulting(triage1, id, at, () => ({ outcome, item: id, land_on: '', part_of: partOf, why: '' }), {
    status,
    completed_outcome: status === 'completed' ? outcome : null,
    workflow_name: `${PACK}:order`,
  });

/** A triage run that recommended `recommend`, its result giving `why`. */
const triageRun = (
  id: string,
  recommend: string,
  why: unknown,
  at: string,
  rest: Record<string, unknown> = {}
) =>
  resulting(triage1, id, at, () => ({ recommend, why, ...rest }), {
    completed_outcome: recommend,
  });

/** `entry`, a deliver run, its result naming `change` at the pointer. */
const deliverNaming = (entry: RunFixture, id: string, change: unknown, at: string) =>
  resulting(entry, id, at, old => ({ ...old, change }));

const notMerged: FactoryChangeState = async lookup => ({
  url: lookup.kind === 'url' ? lookup.url : null,
  merged: false,
  mergedAt: null,
  number: null,
});

async function progressOf(
  runs: RunFixture[],
  changeState: FactoryChangeState = notMerged,
  branchOf: (run: WorkflowRun) => Promise<string | null> = async () => null,
  recorded: FactoryChangeRecord | null = null
) {
  const facts = new Map(runs.map(entry => [entry.run.id, factsOf(entry)]));
  return factoryItemProgress(
    view,
    PACK,
    runs.map(entry => entry.run),
    facts,
    changeState,
    branchOf,
    recorded
  );
}

describe('the facts of one run', () => {
  test('a deliver run with two rounds: returned, then approved; one verdict and one host return', () => {
    const facts = factsOf(deliver1);
    expect(facts.active).toBeNull();
    expect(decisions(facts.rounds)).toEqual({
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
    expect(factsOf(deliver2).change?.url).toBe(PR11);
  });

  test('cut mid-round: the deepest step is the latest started of the three parallel checks', () => {
    const facts = factsOf(deliver2Cut);
    // `rounds` and the three checks run at once; the checks are deeper, review started last.
    expect(facts.active).toBe('rounds.review__review');
    expect(decisions(facts.rounds)?.rounds).toEqual([
      { iteration: 1, verdict: 'returned', outcome: 'return' },
      { iteration: 2, verdict: 'running', outcome: null },
    ]);
    expect(facts.returnCount).toBe(1);
    // No terminal record yet, so no change at the declared pointer.
    expect(facts.change).toBeNull();
    // The same round on a run that ended is stopped.
    const ended = factsOf({ ...deliver2Cut, run: { ...deliver2Cut.run, status: 'failed' } });
    expect(ended.rounds?.rounds.at(-1)).toMatchObject({ verdict: 'stopped', summary: null });
  });

  test('a round whose checks asked instead of approving needs a decision', () => {
    // The same run, its verdict step answering `ask` where it approved.
    const events = deliver1.events.map(row =>
      JSON.stringify(row.data).includes('"outcome":"approve"')
        ? (JSON.parse(
            JSON.stringify(row).replaceAll('"outcome":"approve"', '"outcome":"ask"')
          ) as WorkflowEventRow)
        : row
    );
    const last = factsOf({ ...deliver1, events }).rounds?.rounds.at(-1);
    expect([last?.verdict, last?.outcome]).toEqual(['undecided', 'ask']);
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

  test('triage and plan runs have no rounds, returns, change or work order', () => {
    for (const run of [triage1, plan1])
      expect(factsOf(run)).toMatchObject({
        rounds: null,
        returnCount: 0,
        change: null,
        partOf: null,
      });
    // Triage's one declared shadow step decided; plan has none.
    expect(factsOf(triage1).shadows.map(decision => decision.node)).toEqual(['admit']);
  });
});

describe("each round's steps", () => {
  const rounds = factsOf(deliver2).rounds?.rounds ?? [];
  const stepsOf = (iteration: number) =>
    rounds
      .find(round => round.iteration === iteration)
      ?.steps.map(step => [step.node, step.outcome]);

  test('a round lists the loop steps that recorded an outcome; its summary is the deciding step’s', () => {
    expect(stepsOf(1)).toEqual([
      ['rounds.tests__tests', 'return'],
      ['rounds.product__product', 'approve'],
      ['rounds.review__review', 'approve'],
      ['rounds.verdict__verdict', 'return'],
    ]);
    // Round 1's fix was skipped and the base step records no outcome; neither is a step.
    expect(stepsOf(2)?.[0]).toEqual(['rounds.fix', 'fixed']);
    expect(stepsOf(3)?.at(-1)).toEqual(['rounds.verdict__verdict', 'approve']);
    for (const round of rounds)
      expect(round.summary).toBe(
        round.steps.find(step => step.node === 'rounds.verdict__verdict')?.summary ?? null
      );
    expect(rounds[0]?.summary).toStartWith('Return.');
  });
});

describe("an item's work order, from its order runs' results", () => {
  const at = (day: number) => `2026-11-${day}T00:00:00Z`;
  const o = orderRun;
  test.each([
    [
      'the newest completed run names it, trimmed',
      [o('o1', '40', at(16)), o('o2', ' 48 ', at(17))],
      '48',
    ],
    [
      'failed, running and refused runs are not read',
      [
        o('o1', '48', at(16)),
        o('o2', '50', at(17), 'failed'),
        o('o3', '51', at(18), 'running'),
        o('o4', '52', at(19), 'completed', 'refused'),
      ],
      '48',
    ],
  ] as const)('%s', async (_name, runs, expected) => {
    expect((await progressOf([...runs])).partOf).toBe(expected);
  });
});

describe('a parked item, or one waiting on a person, from its last declared run', () => {
  const T1 = '2026-11-16T00:00:00Z';
  const T2 = '2026-11-17T00:00:00Z';
  const next = view.awaits?.['triage:shape']?.next ?? null;

  test('a parking run is parked with its why, trimmed', async () => {
    const progress = await progressOf([triageRun('t1', 'park', ' Measure it first. ', T1)]);
    expect(progress.parked).toEqual({ label: 'Parked by triage', why: 'Measure it first.' });
  });

  test('a later run, even one still going, takes it up; outcomes the view ends or places on do not park', async () => {
    const park = triageRun('t1', 'park', 'Later.', T1);
    const again = triageRun('t2', 'build', 'Now.', T2);
    expect((await progressOf([park, again])).parked).toBeNull();
    const going = { ...again, run: { ...again.run, status: 'running' as const } };
    expect((await progressOf([park, going])).parked).toBeNull();
    for (const verb of ['close', 'fold', 'build'])
      expect((await progressOf([triageRun('t1', verb, 'Why.', T1)])).parked).toBeNull();
  });

  test('a shaping run waits on a person, with its why and its open questions', async () => {
    const open_questions = [' Which surfaces? ', '', 7, 'Who owns it?'];
    const progress = await progressOf([triageRun('t1', 'shape', ' Why. ', T1, { open_questions })]);
    expect(progress.awaits).toEqual({
      label: 'Needs shaping',
      why: 'Why.',
      questions: ['Which surfaces?', 'Who owns it?'],
      next,
    });
    expect(progress.parked).toBeNull();
  });

  test('a run after the shaping one takes the item up; a parked item waits on no one', async () => {
    const shape = triageRun('t1', 'shape', 'Later.', T1, { open_questions: ['Which?'] });
    expect(next).toStartWith('Settle these questions');
    expect((await progressOf([shape, triageRun('t2', 'build', 'Now.', T2)])).awaits).toBeNull();
    expect((await progressOf([triageRun('t1', 'park', 'Later.', T1)])).awaits).toBeNull();
  });
});

const RECORDED: FactoryChangeRecord = { change: PR10, at: '2026-11-17T01:00:00.000Z' };

describe("an item's progress", () => {
  // A recorded merge reaching the lookup is read below, through readFactoryProgress.
  test('a recorded merge on an item no run names a change for is its change, merged, unasked', async () => {
    const asked: FactoryChangeLookup[] = [];
    const unnamed = await progressOf(
      [triage1, plan1],
      async lookup => {
        asked.push(lookup);
        return { url: null, merged: false, mergedAt: null, number: null };
      },
      async () => 'a-branch',
      RECORDED
    );
    expect(asked).toEqual([]);
    expect(unnamed.change).toEqual({
      url: PR10,
      merged: true,
      mergedAt: RECORDED.at,
      number: null,
    });
    // With no record, such an item has no change.
    expect((await progressOf([triage1, plan1])).change).toBeNull();
  });

  test('item 1 after its deliver run: title, round 2 of 3, returned twice, its change', async () => {
    const seen: [string, number][] = [];
    const progress = await progressOf([triage1, plan1, deliver1], async lookup => {
      if (lookup.kind === 'url') seen.push([lookup.url, lookup.audits.length]);
      // The forge's URL is not shown on the URL path: the run's is.
      return { url: null, merged: true, mergedAt: '2026-11-17T01:00:00Z', number: 10 };
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
      partOf: null,
      returned: 2,
      change: { url: PR10, merged: true, mergedAt: '2026-11-17T01:00:00Z', number: 10 },
      // As the view declares each workflow, not as the runs record `owner/name:workflow`.
      runs: [
        { runId: triage1.run.id, workflow: 'triage', failedStep: null },
        { runId: plan1.run.id, workflow: 'plan', failedStep: null },
        { runId: deliver1.run.id, workflow: 'deliver', failedStep: null },
      ],
      shadows: factsOf(triage1).shadows,
      parked: null,
      awaits: null,
    });
    expect(seen).toEqual([[PR10, factsOf(deliver1).change?.audits.length ?? -1]]);
  });

  test('returned counts every run that sent the item back; round and change are the latest run', async () => {
    const later = { ...deliver2.run, started_at: new Date('2027-01-01T00:00:00Z') };
    const progress = await progressOf([deliver1, { ...deliver2, run: later }]);
    expect(progress.returned).toBe(4);
    expect(progress.round?.runId).toBe(deliver2.run.id);
    expect(progress.change?.url).toBe(PR11);
  });

  test('a deliver that named an empty URL: the change is the pull request on its branches', async () => {
    const PR59 = 'https://github.com/coleam00/archon-factory-console/pull/59';
    const empty = deliverNaming(deliver1, 'deliver-empty', '', '2026-12-01T00:00:00Z');
    const asked: unknown[] = [];
    const progress = await progressOf(
      [triage1, plan1, empty],
      async (lookup, branches) => {
        asked.push({ lookup, branches: await branches() });
        return { url: PR59, merged: true, mergedAt: null, number: 59 };
      },
      async run => `branch-${run.id}`
    );
    expect(asked).toEqual([
      {
        lookup: { kind: 'branch', run: 'deliver-empty' },
        branches: ['branch-deliver-empty', `branch-${plan1.run.id}`, `branch-${triage1.run.id}`],
      },
    ]);
    expect(progress.change).toEqual({ url: PR59, merged: true, mergedAt: null, number: 59 });
  });

  test('an item an order started: the title of the item text the order produced', async () => {
    // The order run carries the work order (a source URL, no item); the triage run after it
    // carries the item text the order stage produced, front matter first.
    const withInputs = (id: string, workflow: string, laterMs: number, inputs: object) => ({
      run: {
        ...triage1.run,
        id,
        workflow_name: workflow,
        metadata: { inputs },
        started_at: new Date(triage1.run.started_at.getTime() + laterMs),
      },
      events: [],
    });
    const order = withInputs('order-run', `${PACK}:order`, 0, {
      key: '36',
      source: 'https://github.com/coleam00/archon-factory-console/issues/36',
    });
    const triage = withInputs('triage-run', triage1.run.workflow_name, 60_000, {
      item: ORDERED_ITEM,
    });
    expect((await progressOf([order, triage])).title).toBe(
      'Items started by a work order show their title'
    );
  });
});

/** The item text an order stage produced for a work order naming an issue, as the live copy holds it. */
const ORDERED_ITEM = [
  '---',
  'id: 36',
  'source: https://github.com/coleam00/archon-factory-console/issues/36',
  '---',
  '',
  '# Items started by a work order show their title',
  '',
  'Since items start with a work order...',
].join('\n');

test.each([
  [
    'an item an order made: the heading after its front matter',
    ORDERED_ITEM,
    'Items started by a work order show their title',
  ],
  ['unterminated front matter', '---\nid: 1\n', null],
])("an item text's title: %s", (_name, text, title) => {
  expect(titleOfItemText(text)).toBe(title);
});

describe('reading progress, and one item whole', () => {
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
        getItemMerge: async () => null,
        getItemLanding: async () => null,
        listOpenItemWaits: async () => [],
        listSkippedItemStarts: async itemIds => new Map(itemIds.map(id => [id, []])),
        listQueuedItemStarts: async itemIds => new Map(itemIds.map(id => [id, []])),
        getInstallHold: async () => null,
        getRunLimit: async () => null,
        listHeldItemStarts: async () => [],
        listItemAsks: async () => [],
        listItemRulings: async () => [],
        listItemLinks: async () => [],
        getResourceStartRequest: async () => null,
        listStartReceiptSources: async () => new Map(),
      },
    };
    return source;
  }

  const unexpected = (id: string, error: unknown) => {
    throw new Error(`unexpected failure for ${id}: ${String(error)}`);
  };
  const input = (onProgressError: (id: string, error: unknown) => void = unexpected) => ({
    view,
    pack: PACK,
    projectKey: 'acme/web',
    changeState: notMerged,
    memo: new FactoryRunFactsMemo(),
    onProgressError,
  });

  test('progress for each asked key, an unknown key left out, in one events read', async () => {
    const counts = { queue: 0, loaded: [] as string[][] };
    const shared = input();
    const read = factoryProgressSchema.parse(
      await readFactoryProgress(pageSource(counts), shared, ['2', '1', '404', '2'])
    );
    expect(read.pack).toBe(PACK);
    expect(Object.keys(read.progress).sort()).toEqual(['1', '2']);
    expect(read.progress['2']?.running?.step).toBe('rounds.review__review');
    expect(read.progress['1']?.change?.url).toBe(PR10);
    // Progress reads no item read, so not the attention queue either.
    expect(counts.queue).toBe(0);
    // Every declared run's events in one read.
    expect(counts.loaded).toHaveLength(1);
  });

  test("each item's recorded merge reaches its change lookup", async () => {
    const source = pageSource({ queue: 0, loaded: [] });
    const merge = {
      change: PR10,
      commit: null,
      at: '2026-11-17T01:00:00.000Z',
      recordedAt: '2026-11-17T01:01:00.000Z',
      via: 'cli' as const,
      fromRun: null,
    };
    const handed: (FactoryChangeRecord | null)[] = [];
    const changeState: FactoryChangeState = async (_lookup, _branches, recorded) => {
      handed.push(recorded);
      return { url: null, merged: recorded !== null, mergedAt: null, number: null };
    };
    const withMerge = { ...input(), changeState };
    source.store.getItemMerge = async id => (id === item1.id ? merge : null);
    const read = await readFactoryProgress(source, withMerge, ['1']);
    expect(handed).toEqual([{ change: PR10, at: merge.at }]);
    expect(read.progress['1']?.change?.merged).toBe(true);
  });

  test("one item: its read and progress, plus each run's story facts; its rounds are the board's", async () => {
    const counts = { queue: 0, loaded: [] as string[][] };
    const detail = factoryItemDetailSchema.parse(
      await readFactoryItem(pageSource(counts), input(), '1')
    );
    expect(detail.pack).toBe(PACK);
    expect(detail.item.runs.map(run => run.id)).toEqual(detail.runs.map(run => run.runId));
    expect(detail.runs.map(run => [run.workflow, run.costUsd, run.step])).toEqual([
      ['triage', null, null],
      ['plan', null, null],
      ['deliver', 13.5, null],
    ]);
    expect(detail.item.progress?.change?.url).toBe(PR10);
    expect(counts.queue).toBe(1);
    const deliver = detail.runs.find(run => run.runId === detail.item.progress?.round?.runId);
    expect(deliver?.change).toBe(PR10);
    expect(deliver).toMatchObject(factoryRunStory(view, deliver1.run, deliver1.events));
    expect(decisions(deliver?.rounds)?.rounds).toEqual(detail.item.progress?.round?.rounds);
    // The board's contract carries no steps or summaries.
    expect(Object.keys(detail.item.progress?.round?.rounds[0] ?? {}).sort()).toEqual([
      'iteration',
      'outcome',
      'verdict',
    ]);
  });

  test('a running run shows its running step; one with no recorded cost reads null', async () => {
    const detail = await readFactoryItem(pageSource({ queue: 0, loaded: [] }), input(), '2');
    expect(detail?.runs).toEqual([
      {
        runId: deliver2Cut.run.id,
        workflow: 'deliver',
        costUsd: null,
        step: 'rounds.review__review',
        rounds: factsOf(deliver2Cut).rounds,
        shadows: [],
        // Still running: it has named no change and returned nothing to say yet.
        change: null,
        said: null,
        models: ['claude-opus-5-5', 'claude-haiku-5-5'],
        steps: factoryRunStory(view, deliver2Cut.run, deliver2Cut.events).steps,
      },
    ]);
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
    source.store.listStartReceiptSources = async ids =>
      new Map(
        ids
          .filter(id => id === receiptId)
          .map(id => [
            id,
            {
              id,
              sourceInstanceId: 'fc-start-plan',
              sourceActor: { source: RUN_ENDED_SOURCE_ACTOR, id: triage.id },
            },
          ])
      );
    const detail = await readFactoryItem(source, input(), '1');
    expect(detail?.runs.map(run => run.cause ?? null)).toEqual([
      null,
      { kind: 'run_ended', runId: triage.id, sourceInstanceId: 'fc-start-plan' },
      null,
    ]);
    expect(detail?.runs.map(run => run.cause ?? null)).toEqual(
      detail?.item.runs.map(run => run.cause)
    );
    expect(Object.hasOwn(detail?.runs[0] ?? {}, 'cause')).toBe(false);
  });

  test("a discoveries run, which no stage lists, gets facts and the view's name: its shadow decision on its row", async () => {
    const drain = drainFixture();
    const source = pageSource({ queue: 0, loaded: [] });
    const ownRun = { ...drain.run, item_id: item1.id };
    source.store.getItemRuns = async () => ({
      item: item1,
      runs: [...(runsOf['1'] ?? []), ownRun],
      descendantIds: [],
    });
    const listed = source.store.listEventsForRuns;
    source.store.listEventsForRuns = async (ids, types) => {
      const read = await listed(ids, types);
      if (ids.includes(ownRun.id)) read.set(ownRun.id, drain.events);
      return read;
    };
    const detail = await readFactoryItem(source, input(), '1');
    const row = detail?.runs.find(run => run.runId === ownRun.id);
    // Named as the view names it, so the item page reads it as the drain, not a raw id.
    expect(row?.workflow).toBe('discoveries');
    expect(row?.shadows.map(decision => [decision.workflow, decision.node])).toEqual([
      ['discoveries', 'result'],
    ]);
    expect(detail?.item.progress?.runs.map(run => run.workflow)).toEqual([
      'triage',
      'plan',
      'deliver',
    ]);
    expect(await readFactoryItem(pageSource({ queue: 0, loaded: [] }), input(), '404')).toBeNull();
  });
});

/**
 * A run of a three-stage delivery workflow (`stage-build`, `stage-check`, `stage-host`,
 * `landgate`), built from the plan fixture's events: each of `nodes` completes with its
 * structured `outcome`, and a completed run returns `value` from its `end` step, as the
 * installed pack's stage workflows do. A running run has no terminal record.
 */
function stageRun(
  workflow: string,
  id: string,
  at: string,
  value: Record<string, unknown>,
  nodes: readonly (readonly [string, string])[] = [],
  status: WorkflowRun['status'] = 'completed'
): RunFixture {
  const [started, completed, finished] = plan1.events as [
    WorkflowEventRow,
    WorkflowEventRow,
    WorkflowEventRow,
  ];
  type NodeData = { node: Record<string, unknown>; invocation: Record<string, unknown> };
  const nodeRow = (
    row: WorkflowEventRow,
    node: string,
    order: number,
    output?: unknown
  ): WorkflowEventRow => {
    const data = row.data as NodeData;
    return {
      ...row,
      id: `${id}-${node}-${row.event_type}`,
      workflow_run_id: id,
      step_name: node,
      event_order: order,
      data: {
        ...data,
        node: { ...data.node, id: node },
        invocation: { ...data.invocation, id: `${id}-${node}` },
        ...(output === undefined ? {} : { structured_output: output }),
      },
    };
  };
  const done = status === 'completed';
  const ran = [...nodes, ...(done ? [['end', String(value.outcome)] as const] : [])];
  const events: WorkflowEventRow[] = ran.flatMap(([node, outcome], index) => [
    nodeRow(started, node, 2 * index),
    nodeRow(completed, node, 2 * index + 1, { outcome, summary: `${node} said ${outcome}` }),
  ]);
  if (done) {
    const data = finished.data as { terminal_record: Record<string, unknown> };
    events.push({
      ...finished,
      id: `${id}-completed`,
      workflow_run_id: id,
      event_order: 2 * ran.length,
      data: {
        ...data,
        terminal_record: {
          ...data.terminal_record,
          run_id: id,
          completed_outcome: value.outcome,
          nodes: ran.map(([node]) => ({ node_id: node, state: 'completed' })),
          returns: { availability: 'available', node_id: 'end', value },
        },
      },
    });
  }
  const run = {
    ...plan1.run,
    id,
    workflow_name: `${PACK}:${workflow}`,
    status,
    completed_outcome: done ? String(value.outcome) : null,
    started_at: new Date(at),
    completed_at: done ? new Date(at) : null,
  };
  return { run, events };
}

const CHECKS = [
  ['review__review', 'approve'],
  ['tests__tests', 'sound'],
  ['product__product', 'approve'],
] as const;

/** A completed stage-check run: round `round` of `allowance`, its verdict `outcome`. */
const checkRun = (id: string, at: string, round: number, allowance: number, outcome: string) =>
  stageRun('stage-check', id, at, { outcome, change: PR12, round, allowance }, [
    ...CHECKS,
    ['verdict__verdict', outcome],
    ['rounds', outcome],
  ]);
const buildRun = (id: string, at: string) =>
  stageRun('stage-build', id, at, { outcome: 'built', change: PR12 }, [['build__build', 'built']]);
const hour = (h: number, day = 21) => `2026-11-${day}T0${h}:00:00Z`;

describe('the three-stage delivery: the change from any stage, rounds from stage-check runs', () => {
  test('a stage-check run is one round: numbered and bounded by its result, decided by its verdict', () => {
    const facts = factsOf(checkRun('c1', hour(1), 2, 3, 'return'));
    const steps = [...CHECKS, ['verdict__verdict', 'return'], ['rounds', 'return']] as const;
    expect(facts.rounds).toEqual({
      max: 3,
      rounds: [
        {
          iteration: 2,
          verdict: 'returned',
          outcome: 'return',
          summary: 'verdict__verdict said return',
          // Every step that recorded an outcome but `end`, which returns the result.
          steps: steps.map(([node, outcome]) => ({
            node,
            outcome,
            summary: `${node} said ${outcome}`,
          })),
        },
      ],
    });
    expect(facts.returnCount).toBe(1);
    expect(facts.change?.url).toBe(PR12);
  });

  test("the item's rounds are its stage-check runs, the newest allowance its bound: round 3 of 4", async () => {
    const runs = [
      buildRun('b1', hour(1)),
      checkRun('c1', hour(2), 1, 3, 'return'),
      buildRun('b2', hour(3)),
      checkRun('c2', hour(4), 2, 3, 'return'),
      buildRun('b3', hour(5)),
      // After a one-more-round answer, the pack allows four.
      checkRun('c3', hour(6), 3, 4, 'approve'),
      stageRun('stage-host', 'h1', hour(7), {}, [], 'running'),
    ];
    expect((await progressOf(runs)).round).toEqual({
      runId: 'c3',
      iteration: 3,
      max: 4,
      rounds: [
        { iteration: 1, verdict: 'returned', outcome: 'return' },
        { iteration: 2, verdict: 'returned', outcome: 'return' },
        { iteration: 3, verdict: 'approved', outcome: 'approve' },
      ],
    });
  });

  test('after a replan the rounds start again: only the new cycle is read', async () => {
    const runs = [
      checkRun('c1', hour(2), 1, 3, 'return'),
      checkRun('c2', hour(4), 2, 3, 'replan'),
      buildRun('b2', hour(5)),
      checkRun('c3', hour(6), 1, 3, 'return'),
    ];
    expect((await progressOf(runs)).round).toEqual({
      runId: 'c3',
      iteration: 1,
      max: 3,
      rounds: [{ iteration: 1, verdict: 'returned', outcome: 'return' }],
    });
  });

  const stageBuild = stageRun('stage-build', 'b1', hour(1), { outcome: 'built', change: PR11 });
  const stageHost = stageRun('stage-host', 'h1', hour(3), { outcome: 'ready', change: PR12 });
  test.each([
    [
      'the newest stage run naming one; one going or naming an empty one does not displace it',
      [
        stageBuild,
        stageHost,
        stageRun('stage-check', 'c2', hour(4), {}, [], 'running'),
        stageRun('landgate', 'g1', hour(5), { outcome: 'land', change: '' }),
      ],
      PR12,
    ],
    [
      "a land gate naming none does not displace a deliver run's",
      [
        deliverNaming(deliver1, 'd1', PR10, '2026-11-20T01:00:00Z'),
        stageRun('landgate', 'g1', '2026-11-20T02:00:00Z', { outcome: 'land' }),
      ],
      PR10,
    ],
  ])('the change: %s', async (_name, runs, url) => {
    expect((await progressOf(runs)).change?.url).toBe(url);
  });
});

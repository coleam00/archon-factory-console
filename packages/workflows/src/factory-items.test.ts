import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  factoryItemProgress,
  factoryProgressSchema,
  factoryRunFacts,
  FactoryRunFactsMemo,
  factoryItemDetailSchema,
  readFactoryItem,
  readFactoryProgress,
  type FactoryChangeState,
  type FactoryRound,
  titleOfItemText,
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

  test('a round whose checks asked instead of approving needs a decision, with that outcome', () => {
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
      { iteration: 2, verdict: 'undecided', outcome: 'ask' },
    ]);
  });

  test('without a declared approval, a completed round needs a decision, never approved', () => {
    const { approves: _approves, ...undeclared } = view;
    expect(
      decisions(factoryRunFacts(undeclared, PACK, deliver1.run, deliver1.events).rounds)?.rounds
    ).toEqual([
      { iteration: 1, verdict: 'returned', outcome: 'return' },
      { iteration: 2, verdict: 'undecided', outcome: 'approve' },
    ]);
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
    const host = factoryRunFacts(hostView, PACK, deliver2.run, deliver2.events).rounds;
    expect(decisions(host)?.rounds).toEqual([
      { iteration: 1, verdict: 'undecided', outcome: 'clear' },
    ]);
    expect(host?.rounds[0]?.steps.map(step => step.node)).toEqual(['hostrounds.host__host']);
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
      expect(factsOf(run)).toEqual({
        active: null,
        rounds: null,
        returnCount: 0,
        failedStep: null,
        change: null,
        partOf: null,
      });
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

  test("a round's summary is the summary of the return or approval step that decided it", () => {
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

/**
 * An order run: the triage fixture under the pack's `order` workflow, its result naming
 * `partOf` at the pointer the view declares, as the live factory's order runs record it.
 */
function orderRun(
  id: string,
  partOf: unknown,
  at: string,
  status: WorkflowRun['status'] = 'completed'
): { run: WorkflowRun; events: WorkflowEventRow[] } {
  const run = {
    ...triage1.run,
    id,
    status,
    workflow_name: `${PACK}:order`,
    started_at: new Date(at),
  };
  const events = triage1.events.map(row => {
    if (row.event_type !== 'workflow_completed') return row;
    const data = row.data as { terminal_record: { returns: Record<string, unknown> } };
    const value = { outcome: 'ready', item: id, land_on: '', part_of: partOf, why: '' };
    return {
      ...row,
      workflow_run_id: id,
      data: {
        ...data,
        terminal_record: {
          ...data.terminal_record,
          returns: { ...data.terminal_record.returns, value },
        },
      },
    };
  });
  return { run, events };
}

describe("an item's work order, from its order runs' results", () => {
  test('the newest completed order run names it, trimmed', async () => {
    const old = orderRun('o1', '40', '2026-11-16T00:00:00Z');
    const newer = orderRun('o2', ' 48 ', '2026-11-17T00:00:00Z');
    expect(factsOf(newer).partOf).toBe('48');
    expect((await progressOf([old, newer])).partOf).toBe('48');
  });

  test('an empty value on the newest completed run is no order, even when an older run named one', async () => {
    const old = orderRun('o1', '48', '2026-11-16T00:00:00Z');
    const newer = orderRun('o2', '', '2026-11-17T00:00:00Z');
    expect((await progressOf([old, newer])).partOf).toBeNull();
  });

  test('a failed or running order run is not read; the newest completed one is', async () => {
    const done = orderRun('o1', '48', '2026-11-16T00:00:00Z');
    const failed = orderRun('o2', '50', '2026-11-17T00:00:00Z', 'failed');
    const running = orderRun('o3', '51', '2026-11-18T00:00:00Z', 'running');
    expect(factsOf(failed).partOf).toBeNull();
    expect((await progressOf([done, failed, running])).partOf).toBe('48');
  });

  test('a value that is not a string is none', async () => {
    expect(factsOf(orderRun('o1', 48, '2026-11-16T00:00:00Z')).partOf).toBeNull();
  });

  test('a view that declares no partOf reads none', () => {
    const { partOf: _partOf, ...undeclared } = view;
    const run = orderRun('o1', '48', '2026-11-16T00:00:00Z');
    expect(factoryRunFacts(undeclared, PACK, run.run, run.events).partOf).toBeNull();
  });
});

const notMerged: FactoryChangeState = async () => ({ merged: false, mergedAt: null, number: null });

async function progressOf(
  runs: { run: WorkflowRun; events: WorkflowEventRow[] }[],
  changeState: FactoryChangeState = notMerged,
  branchOf: (run: WorkflowRun) => Promise<string | null> = async () => null
) {
  const facts = new Map(runs.map(entry => [entry.run.id, factsOf(entry)]));
  return factoryItemProgress(
    view,
    PACK,
    runs.map(entry => entry.run),
    facts,
    changeState,
    branchOf
  );
}

describe("an item's progress", () => {
  test("the change lookup gets the declared runs' branches, newest first, once each", async () => {
    // The newest declared run has its own branch; two older declared runs share one, so it
    // is read once. A newer run of a workflow the view does not declare has no facts and
    // its branch is never offered.
    const later = {
      ...deliver1,
      run: { ...deliver1.run, id: 'later', started_at: new Date('2027-01-01') },
    };
    const undeclared = {
      ...deliver1.run,
      id: 'undeclared',
      workflow_name: 'someone/else:deliver',
      started_at: new Date('2027-02-01'),
    };
    const recorded: Record<string, string | null> = {
      [triage1.run.id]: null,
      [plan1.run.id]: 'shared',
      [deliver1.run.id]: 'shared',
      later: 'later-branch',
      undeclared: 'other',
    };
    const declared = [triage1, plan1, deliver1, later];
    const read: string[][] = [];
    await factoryItemProgress(
      view,
      PACK,
      [...declared.map(entry => entry.run), undeclared],
      new Map(declared.map(entry => [entry.run.id, factsOf(entry)])),
      async (_url, _audits, branches) => {
        read.push([...(await branches())]);
        return { merged: false, mergedAt: null, number: null };
      },
      async run => recorded[run.id] ?? null
    );
    expect(read).toEqual([['later-branch', 'shared']]);
  });

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
      partOf: null,
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

  test('an item an order started: the title of the item text the order produced', async () => {
    // The order run carries the work order (a source URL, no item); the triage run after it
    // carries the item text the order stage produced, front matter first.
    const order = withInputs(triage1, 'order-run', 'Wirasm/archon-software-factory:order', 0, {
      key: '36',
      source: 'https://github.com/coleam00/archon-factory-console/issues/36',
    });
    const triage = withInputs(triage1, 'triage-run', triage1.run.workflow_name, 60_000, {
      item: ORDERED_ITEM,
    });
    const progress = await progressOf([order, triage]);
    expect(progress.title).toBe('Items started by a work order show their title');
  });
});

/** A copy of a fixture run with its own id, workflow and inputs, started `laterMs` after it. */
function withInputs(
  entry: { run: WorkflowRun; events: WorkflowEventRow[] },
  id: string,
  workflowName: string,
  laterMs: number,
  inputs: Record<string, string>
): { run: WorkflowRun; events: WorkflowEventRow[] } {
  return {
    run: {
      ...entry.run,
      id,
      workflow_name: workflowName,
      metadata: { inputs },
      started_at: new Date(entry.run.started_at.getTime() + laterMs),
    },
    events: [],
  };
}

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

describe("an item text's title", () => {
  test('an item an order made: the heading after its front matter', () => {
    expect(titleOfItemText(ORDERED_ITEM)).toBe('Items started by a work order show their title');
    expect(titleOfItemText(ORDERED_ITEM.replaceAll('\n', '\r\n'))).toBe(
      'Items started by a work order show their title'
    );
  });

  test("a text-only order: the operator's first line", () => {
    expect(titleOfItemText('Fix the board\n\nmore')).toBe('Fix the board');
  });

  test('an item started the old way: the first line without its `#<n> `', () => {
    expect(
      titleOfItemText('#12 Stage and step pages show which items are on a step now\n\nbody')
    ).toBe('Stage and step pages show which items are on a step now');
  });

  test('no title line: unterminated front matter, empty or blank text, a bare heading marker', () => {
    expect(titleOfItemText('---\nid: 1\n')).toBeNull();
    expect(titleOfItemText('')).toBeNull();
    expect(titleOfItemText(' \n\t\n')).toBeNull();
    expect(titleOfItemText('# \nbody')).toBeNull();
    expect(titleOfItemText('---\nid: 1\n---\n\n')).toBeNull();
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
    // So does where a result names the item's work order.
    expect(
      memo.get({ ...view, partOf: { workflow: 'order', pointer: '/order' } }, PACK, deliver1.run)
    ).toBeUndefined();
  });

  test('is bounded, oldest out', () => {
    const memo = new FactoryRunFactsMemo(1);
    memo.set(view, PACK, deliver1.run, factsOf(deliver1));
    memo.set(view, PACK, deliver2.run, factsOf(deliver2));
    expect(memo.get(view, PACK, deliver1.run)).toBeUndefined();
    expect(memo.get(view, PACK, deliver2.run)).toBeDefined();
  });
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
        listSkippedItemStarts: async () => [],
        listQueuedItemStarts: async () => [],
        listItemAsks: async () => [],
        listItemRulings: async () => [],
        listItemLinks: async () => [],
        getResourceStartRequest: async () => null,
        getStartReceipt: async () => null,
      },
    };
    return source;
  }

  const progressInput = (
    memo: FactoryRunFactsMemo,
    onProgressError: (id: string, error: unknown) => void
  ) => ({
    view,
    pack: PACK,
    projectKey: 'acme/web',
    changeState: notMerged,
    memo,
    onProgressError,
  });

  test('progress for each asked key, an unknown key left out; ended runs are memoised', async () => {
    const counts = { queue: 0, loaded: [] as string[][] };
    const input = progressInput(new FactoryRunFactsMemo(), (id, error) => {
      throw new Error(`unexpected failure for ${id}: ${String(error)}`);
    });
    const read = factoryProgressSchema.parse(
      await readFactoryProgress(pageSource(counts), input, ['2', '1', '404', '2'])
    );
    expect(read.pack).toBe(PACK);
    expect(Object.keys(read.progress).sort()).toEqual(['1', '2']);
    expect(read.progress['2']?.running?.step).toBe('rounds.review__review');
    expect(read.progress['1']?.change?.url).toBe(PR10);
    // Progress reads no item read, so not the attention queue either.
    expect(counts.queue).toBe(0);
    // Every declared run's events in one read.
    expect(counts.loaded).toHaveLength(1);
    await readFactoryProgress(pageSource(counts), input, ['1', '2']);
    // The second read loads only the running run; the ended ones were memoised.
    expect(counts.loaded.at(-1)).toEqual([deliver2Cut.run.id]);
  });

  test("items' merge states are looked up together, not one after another", async () => {
    // Item 3 is a second item whose deliver run recorded the same kind of change as item 1's.
    const source = pageSource({ queue: 0, loaded: [] });
    const reads = source.store.getItemRuns;
    source.store.getItemRuns = async (projectKey, key) =>
      key === '3'
        ? {
            item: { id: 'item-3', projectKey, key: '3' },
            runs: [{ ...deliver1.run, id: 'run-3', item_id: 'item-3' }],
            descendantIds: [],
          }
        : reads(projectKey, key);
    const listEvents = source.store.listEventsForRuns;
    source.store.listEventsForRuns = async (ids, types) => {
      const read = await listEvents(ids, types);
      if (ids.includes('run-3')) read.set('run-3', deliver1.events);
      return read;
    };
    // Each lookup answers only once both are in flight: a read that waited on one first would hang.
    let started = 0;
    let release: () => void = () => {};
    const both = new Promise<void>(resolve => {
      release = resolve;
    });
    const changeState: FactoryChangeState = async () => {
      started++;
      if (started === 2) release();
      await both;
      return { merged: false, mergedAt: null, number: null };
    };
    const read = await readFactoryProgress(
      source,
      { ...progressInput(new FactoryRunFactsMemo(), () => {}), changeState },
      ['1', '3']
    );
    expect(started).toBe(2);
    expect(Object.keys(read.progress).sort()).toEqual(['1', '3']);
  });

  test("one item's facts failing gives it null progress and leaves the others", async () => {
    const failed: string[] = [];
    const read = await readFactoryProgress(
      pageSource({ queue: 0, loaded: [] }, deliver2Cut.run.id),
      progressInput(new FactoryRunFactsMemo(), id => failed.push(id)),
      ['1', '2']
    );
    expect(read.progress['2']).toBeNull();
    expect(read.progress['1']).not.toBeNull();
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

  test("one item: its read and progress, plus each run's timeline facts", async () => {
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
      { kind: 'run_ended', runId: triage.id, sourceInstanceId: 'fc-start-plan' },
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

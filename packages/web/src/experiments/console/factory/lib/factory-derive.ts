/**
 * Items with their progress, composed from Archon's generic reads: each run's record
 * (`GET /api/workflows/runs/records`), what the forge says of the items' issues and changes
 * (`GET /api/forge/subjects`), and the view file. The board's read and the item page both go
 * through here, so an item reads alike on both.
 */
import type {
  ForgeQuery,
  getForgeSubjects,
  getRunRecords,
  ItemRead,
  RecordFields,
  RunRecord,
} from '../api';
import type { WithinDeadline } from './deadline';
import {
  changeLookup,
  declaredRuns,
  declaredWorkflow,
  itemProgress,
  type ChangeLookup,
} from './item-progress';
import { issueNumber } from './item-key';
import type { FactoryChange, FactoryItem } from './progress-types';
import { runFacts, type RunFacts } from './run-facts';
import { roundsSources } from './step-label';
import type { FactoryViewListed } from './views';

export interface DeriveReads {
  getRunRecords: typeof getRunRecords;
  getForgeSubjects: typeof getForgeSubjects;
}

type ItemRun = ItemRead['runs'][number];

/** The most run ids one records request names: the route's bound, `RUN_RECORDS_MAX` (scripts/run-records-page-parity.test.ts). */
export const RECORDS_PAGE = 100;
/** The most issues and changes one forge request names, keeping its URL short. */
const FORGE_PAGE = 40;
/** How many ended runs' records a page keeps; about every run of a large project. */
const KEPT_RECORDS = 3_000;

const TERMINAL: ReadonlySet<string> = new Set(['completed', 'failed', 'cancelled']);

/**
 * Ended runs' records, kept for the page's life: an ended run's record does not change, so a
 * re-read asks only for runs still going. Keyed by status and end time too, since a failed
 * run can be resumed and end again, and by the fields read, since the view can change. The
 * oldest entry goes first.
 */
const kept = new Map<string, RunRecord>();
const keyOf = (run: ItemRun, fields: RecordFields): string | null =>
  TERMINAL.has(run.status)
    ? `${run.id}|${run.status}|${run.completedAt ?? ''}|${JSON.stringify(fields)}`
    : null;

/** Forgets every kept record; for tests. */
export function forgetRunRecords(): void {
  kept.clear();
}

/**
 * The fields of a run's record the facts read: a step output's `outcome` and `summary`, and
 * the top-level fields of the result the view's pointers start in. A pointer to the whole
 * result keeps it whole.
 */
export function recordFields(view: FactoryViewListed): RecordFields {
  const d = view.declaration;
  const pointers = [
    ...[d.change ?? []].flat().map(source => source.pointer),
    ...roundsSources(d).flatMap(source =>
      'loop' in source ? [] : [source.round, source.allowance]
    ),
    ...(d.partOf === undefined ? [] : [d.partOf.pointer]),
    ...Object.values(d.parked ?? {}).flatMap(entry => entry.why ?? []),
    ...Object.values(d.awaits ?? {}).flatMap(entry =>
      [entry.why ?? [], entry.questions ?? []].flat()
    ),
    ...(d.story?.said ?? []),
  ];
  const result = pointers.map(pointer =>
    pointer.split('/')[1]?.replaceAll('~1', '/').replaceAll('~0', '~')
  );
  return {
    output: ['outcome', 'summary'],
    result: result.some(key => key === undefined) ? null : [...new Set(result as string[])],
  };
}

/** The records of `runs`, by id; a run the server could not read is absent. */
export async function recordsOf(
  runs: readonly ItemRun[],
  fields: RecordFields,
  reads: DeriveReads,
  within: WithinDeadline
): Promise<Map<string, RunRecord>> {
  const records = new Map<string, RunRecord>();
  const ask: string[] = [];
  for (const run of runs) {
    const key = keyOf(run, fields);
    const record = key === null ? undefined : kept.get(key);
    if (record === undefined) ask.push(run.id);
    else records.set(run.id, record);
  }
  const unique = [...new Set(ask)];
  const pages: string[][] = [];
  for (let start = 0; start < unique.length; start += RECORDS_PAGE)
    pages.push(unique.slice(start, start + RECORDS_PAGE));
  const pageReads = await Promise.all(
    pages.map(page => within(signal => reads.getRunRecords(page, fields, { signal })))
  );
  for (const read of pageReads) for (const record of read.records) records.set(record.id, record);
  keep(runs, fields, records);
  return records;
}

/** Keeps the records of `runs` that ended, as read, the oldest going first past the bound. */
function keep(
  runs: readonly ItemRun[],
  fields: RecordFields,
  records: ReadonlyMap<string, RunRecord>
): void {
  for (const run of runs) {
    const key = keyOf(run, fields);
    const record = records.get(run.id);
    if (key !== null && record !== undefined && record.status === run.status) kept.set(key, record);
  }
  for (const oldest of kept.keys()) {
    if (kept.size <= KEPT_RECORDS) break;
    kept.delete(oldest);
  }
}

/** The facts of every declared run of `items` that has a record. */
export function factsOf(
  view: FactoryViewListed,
  items: readonly ItemRead[],
  records: ReadonlyMap<string, RunRecord>
): Map<string, RunFacts> {
  const facts = new Map<string, RunFacts>();
  for (const item of items)
    for (const run of declaredRuns(view, item)) {
      const record = records.get(run.id);
      if (record !== undefined)
        facts.set(
          run.id,
          runFacts(view.declaration, declaredWorkflow(view, run.workflow), run, record)
        );
    }
  return facts;
}

/** What the forge answered for a set of items. */
export interface ForgeRead {
  /** Each issue's title, by number; absent while the forge has not named it. */
  titles: Map<number, string>;
  /** Whether the forge is still being asked about an issue: read again shortly. */
  titlesPending: boolean;
  /** Each change's answer, by the run that delivered it. */
  changes: Map<string, FactoryChange>;
}

/** The issue number an item's key names, when it names one. */
export function itemIssue(key: string): number | null {
  const number = issueNumber(key);
  return number === null || Number(number) <= 0 ? null : Number(number);
}

/** Asks the forge about every issue and change, a page of them per request. */
export async function forgeRead(
  codebaseId: string,
  issues: readonly number[],
  lookups: readonly NonNullable<ChangeLookup>[],
  reads: Pick<DeriveReads, 'getForgeSubjects'>,
  within: WithinDeadline
): Promise<ForgeRead> {
  const read: ForgeRead = { titles: new Map(), titlesPending: false, changes: new Map() };
  const subjects = [
    ...[...new Set(issues)].map(issue => ({ issue })),
    ...lookups.map(lookup => ({ lookup })),
  ];
  const pages: (typeof subjects)[] = [];
  for (let start = 0; start < subjects.length; start += FORGE_PAGE)
    pages.push(subjects.slice(start, start + FORGE_PAGE));
  // Together: each page may wait a few seconds on lookups the server has not made yet.
  const answers = await Promise.all(
    pages.map(page => {
      const query: ForgeQuery = {
        codebaseId,
        issues: page.flatMap(s => ('issue' in s ? [s.issue] : [])),
        changes: page.flatMap(s =>
          'lookup' in s && s.lookup.url !== null ? [{ run: s.lookup.run, url: s.lookup.url }] : []
        ),
        branchRuns: page.flatMap(s =>
          'lookup' in s && s.lookup.url === null ? [s.lookup.run] : []
        ),
      };
      return within(signal => reads.getForgeSubjects(query, { signal }));
    })
  );
  for (const answer of answers) {
    for (const issue of answer.issues) {
      if (issue.title !== null) read.titles.set(issue.number, issue.title);
      if (issue.pending) read.titlesPending = true;
    }
    for (const { run, ...change } of answer.changes) read.changes.set(run, change);
  }
  return read;
}

/** Each item's change lookup, by key, for the items whose declared runs all have facts. */
export function lookupsOf(
  view: FactoryViewListed,
  items: readonly ItemRead[],
  facts: ReadonlyMap<string, RunFacts>
): Map<string, NonNullable<ChangeLookup>> {
  const lookups = new Map<string, NonNullable<ChangeLookup>>();
  for (const item of items) {
    const declared = declaredRuns(view, item);
    if (declared.some(run => !facts.has(run.id))) continue;
    const lookup = changeLookup(declared, facts);
    if (lookup !== null) lookups.set(item.item.key, lookup);
  }
  return lookups;
}

/** Items with their progress, and what to read again for. */
export interface DerivedItems {
  items: FactoryItem[];
  /** Each item's change lookup by key, so a merge watch can ask about it again. */
  lookups: Map<string, NonNullable<ChangeLookup>>;
  titlesPending: boolean;
}

/**
 * `items` with their progress through `view`. A run whose record could not be read leaves its
 * item's progress null (unknown, not partial); a failed request fails the whole read.
 */
export async function deriveItems(
  codebaseId: string,
  view: FactoryViewListed,
  items: readonly ItemRead[],
  reads: DeriveReads,
  within: WithinDeadline
): Promise<DerivedItems> {
  const runs = items.flatMap(item => declaredRuns(view, item));
  const facts = factsOf(view, items, await recordsOf(runs, recordFields(view), reads, within));
  const lookups = lookupsOf(view, items, facts);
  const issues = items.flatMap(item => itemIssue(item.item.key) ?? []);
  const forge = await forgeRead(codebaseId, issues, [...lookups.values()], reads, within);
  return {
    items: items.map(item => {
      const issue = itemIssue(item.item.key);
      const title = issue === null ? null : (forge.titles.get(issue) ?? null);
      return {
        ...item,
        progress: itemProgress(view, item, facts, { title, changes: forge.changes }),
      };
    }),
    lookups,
    titlesPending: forge.titlesPending,
  };
}

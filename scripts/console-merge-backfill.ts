/**
 * Print the `archon workflow merged` lines that record, once, the merges the forge already
 * reports for items the engine holds no merge record for: `bun run scripts/console-merge-backfill.ts
 * --base http://localhost:<port> --codebase <id>`.
 *
 * The console reads an item's recorded merge before it asks the forge, and never asks about a
 * recorded one (#137), so a restart shows those items merged at once. Land runs record their
 * merges; items merged before that, or by hand, have no record. The console never writes engine
 * data, so this script only reads a running console's JSON and prints. It never opens a
 * database and never runs the CLI.
 *
 * A line is printed only for a change the forge reports merged, with its merge time, whose URL
 * one of the item's own runs named (URL-confirmed). Every other item that looks merged, or whose
 * state the forge could not say, is listed under "Not printed" with why: its pull request was
 * found by branch, the forge gave no merge time, it answered `unknown`, or it is still asking.
 * Those need a person to confirm the pull request and record it by hand, or leave it when it
 * never merged; the output says so under the list. A run with nothing to record says that.
 *
 * Running the lines: from a checkout of the project (so the CLI resolves it), with `ARCHON_HOME`
 * set to the home the console reads. Agents inherit `ARCHON_HOME` pointing at the live factory's
 * home, so on a `dev:console` copy scope it to the copy and unset `DATABASE_URL`, for example
 * `ARCHON_HOME=$PWD/.console-home DATABASE_URL= bun packages/cli/src/cli.ts workflow merged ...`.
 * On the live home the operator runs them.
 */

/** What the script reads of one item: its key, whether it carries a merge record, its change. */
export interface BackfillItem {
  key: string;
  recorded: boolean;
  change: {
    url: string | null;
    merged: boolean | 'unknown' | 'pending';
    mergedAt: string | null;
  } | null;
  /** The changes the item's runs named; read only for an item the forge reports merged. */
  runChanges: readonly (string | null)[];
}

export interface Backfill {
  print: { key: string; change: string; at: string }[];
  notPrinted: { key: string; reason: string }[];
}

/** Which items get a printed line, and why each other merged-looking or unknown one does not. */
export function selectBackfill(items: readonly BackfillItem[]): Backfill {
  const backfill: Backfill = { print: [], notPrinted: [] };
  for (const { key, recorded, change, runChanges } of items) {
    if (recorded || change === null || change.merged === false) continue;
    const skip = (reason: string): void => {
      backfill.notPrinted.push({ key, reason });
    };
    if (change.merged === 'unknown') skip('the forge could not say whether it merged');
    else if (change.merged === 'pending') skip('the console is still asking the forge; run again');
    else if (change.url === null || !runChanges.includes(change.url))
      skip('its pull request was found by branch, not named by a run');
    else if (change.mergedAt === null) skip('the forge gave no merge time');
    else backfill.print.push({ key, change: change.url, at: change.mergedAt });
  }
  return backfill;
}

/** A line to run, its values quoted for a POSIX shell. */
export function mergedLine(entry: Backfill['print'][number]): string {
  const quote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;
  return `archon workflow merged --item ${quote(entry.key)} --change ${quote(entry.change)} --at ${quote(entry.at)}`;
}

async function readJson(base: string, path: string, query: URLSearchParams): Promise<unknown> {
  const response = await fetch(`${base}${path}?${query.toString()}`);
  if (!response.ok) throw new Error(`${path} answered ${String(response.status)}`);
  return response.json();
}

interface WindowPage {
  items: { item: { key: string }; merged: unknown }[];
  next: string | null;
}
interface ProgressPage {
  progress: Record<string, { change: BackfillItem['change'] } | null>;
}
interface ItemDetail {
  runs: { change: string | null }[];
}

/** One page of the window's items with their changes; `runChanges` is filled later. */
async function readPage(
  base: string,
  codebase: string,
  after: string | null
): Promise<{ items: BackfillItem[]; next: string | null }> {
  const query = new URLSearchParams({ project: codebase, limit: '100' });
  if (after === null) query.set('since', '1970-01-01T00:00:00Z');
  else query.set('after', after);
  const page = (await readJson(base, '/api/items/window', query)) as WindowPage;
  if (page.items.length === 0) return { items: [], next: page.next };
  const keys = new URLSearchParams({ codebaseId: codebase });
  for (const { item } of page.items) keys.append('keys', item.key);
  const progress = (await readJson(base, '/api/factory/progress', keys)) as ProgressPage;
  const items = page.items.map(read => ({
    key: read.item.key,
    recorded: read.merged !== null,
    change: progress.progress[read.item.key]?.change ?? null,
    runChanges: [],
  }));
  return { items, next: page.next };
}

/** Every item of the codebase, as the board reads them, with the changes its runs named. */
async function readItems(base: string, codebase: string): Promise<BackfillItem[]> {
  const items: BackfillItem[] = [];
  let after: string | null = null;
  do {
    const page = await readPage(base, codebase, after);
    items.push(...page.items);
    after = page.next;
  } while (after !== null);
  const merged = items.filter(item => !item.recorded && item.change?.merged === true);
  for (const item of merged) {
    const query = new URLSearchParams({ codebaseId: codebase, key: item.key });
    const detail = (await readJson(base, '/api/factory/item', query)) as ItemDetail;
    item.runChanges = detail.runs.map(run => run.change);
  }
  return items;
}

const USAGE = [
  'Usage: bun run scripts/console-merge-backfill.ts --base http://localhost:<port> --codebase <id>',
  "The codebase id is the one in the console's project URLs (/console/p/<id>/...).",
].join('\n');

function option(args: readonly string[], name: string): string | undefined {
  const value = args[args.indexOf(name) + 1];
  return args.includes(name) ? value : undefined;
}

/**
 * The script's output: a line to run for each printed merge, then each item it left out with
 * why and what to do about it, or one line saying there is nothing to record.
 */
export function backfillReport({ print, notPrinted }: Backfill): string[] {
  if (print.length === 0 && notPrinted.length === 0)
    return ['# Nothing to record: every merged item already carries a merge record.'];
  const lines = print.map(mergedLine);
  if (notPrinted.length === 0) return lines;
  return [
    ...(lines.length > 0 ? [...lines, ''] : []),
    '# Not printed:',
    ...notPrinted.map(({ key, reason }) => `#   ${key}: ${reason}`),
    '# For each, confirm its pull request on the forge. If it merged, record it by hand from a',
    "# checkout of the project, with ARCHON_HOME set to the console's home:",
    '#   archon workflow merged --item <key> --change <PR URL> --at <merge time>',
    '# If it never merged, leave it: the console keeps it out of the counts and says so.',
  ];
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const base = option(args, '--base');
  const codebase = option(args, '--codebase');
  if (base === undefined || codebase === undefined) {
    console.error(USAGE);
    process.exit(1);
  }
  try {
    const items = await readItems(base.replace(/\/$/, ''), codebase);
    for (const line of backfillReport(selectBackfill(items))) console.log(line);
  } catch (error) {
    console.error(`Could not read the console at ${base}: ${(error as Error).message}`);
    process.exit(1);
  }
}

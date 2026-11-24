/**
 * `bun run check:factory-view`: checks each project factory view
 * (`.archon/packs/<pack key>.factory-view.json`) and its How it works file
 * (`<pack key>.factory-overview.json`) against the pack's graph (`checkViewNames`,
 * `checkOverviewEdges`). It exits 1 on a name the view uses that the graph lacks, or an overview
 * edge between two stages the graph does not connect, and prints a warning, still passing, for
 * what the graph has that the view leaves out. CI runs it in the generated-files group of
 * `scripts/validate.ts`.
 *
 * The graph is always read from the pack itself, never from a committed capture. The pack's
 * commit is pinned in one place, `<pack key>.pack-pin.json` beside the view (`{ repo, commit }`):
 * - With no home named (CI), the pinned commit is fetched from GitHub at depth 1 into a throwaway
 *   home, laid out as `archon plugin add` lays out an install.
 * - With a home named (ARCHON_FACTORY_LIVE_HOME, else ARCHON_HOME), the pack installed there is
 *   read, and an install at another commit than the pin fails the check, so a reinstall is caught
 *   where it happens (the factory's own validate command runs this) before CI checks an older
 *   pack. When the CLI cannot read the pack there, the check fails with the CLI's reason rather
 *   than falling back to the pin: the CLI alone decides whether the pack is installed.
 *
 * Either way the graph is `archon pack graph <pack key> --json` (core `readPackGraph`, the read
 * `GET /api/packs/{pack}/graph` answers from) run on a throwaway home holding only those plugins:
 * an install is only read, and with no trigger files every arrow is one the pack declares.
 * `--pin <pack key>` rewrites the pin from the pack installed in the named home.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getPluginsPath } from '@archon/paths';
import { workflowPackReceiptSchema } from '../packages/plugin-manifest/src/index';
import { packTreePath, receiptPath } from '../packages/plugin-manifest/src/store';
import { type PackGraph, packGraphSchema } from '../packages/workflows/src/pack-graph';
import {
  FACTORY_OVERVIEW_PROJECT_SUFFIX,
  factoryOverviewSchema,
} from '../packages/workflows/src/schemas/factory-overview';
import {
  FACTORY_VIEW_PROJECT_SUFFIX,
  factoryViewSchema,
} from '../packages/workflows/src/schemas/factory-view';
import { checkOverviewEdges, checkViewNames, type NameCheck } from './factory-view-names';

const root = resolve(import.meta.dir, '..');
const packs = join(root, '.archon', 'packs');
const PIN_SUFFIX = '.pack-pin.json';

/** The one place a pack's commit is pinned: its GitHub `owner/name` and the commit checked. */
export interface PackPin {
  repo: string;
  commit: string;
}

/**
 * A pin file's contents, or what is wrong with them. Read by hand rather than with zod: the
 * repository root does not depend on zod, and a script resolves its imports from the root.
 */
export function parsePin(value: unknown): PackPin | { problems: string[] } {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return { problems: ['expected an object { repo, commit }'] };
  const fields = new Map(Object.entries(value));
  const repo = fields.get('repo');
  const commit = fields.get('commit');
  const problems = [...fields.keys()]
    .filter(key => key !== 'repo' && key !== 'commit')
    .map(key => `${key}: not a pin field`);
  const repoOk = typeof repo === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo);
  const commitOk = typeof commit === 'string' && /^[0-9a-f]{40}$/.test(commit);
  if (!repoOk) problems.push('repo: expected owner/name');
  if (!commitOk) problems.push('commit: expected a full commit sha');
  return problems.length === 0 && typeof repo === 'string' && typeof commit === 'string'
    ? { repo, commit }
    : { problems };
}

/** The `plugins/` of the home `env` names, whether or not it exists; undefined when none is. */
export function namedPlugins(env: Record<string, string | undefined>): string | undefined {
  const home = env.ARCHON_FACTORY_LIVE_HOME || env.ARCHON_HOME;
  return home ? getPluginsPath(home) : undefined;
}

/** A pack's graph and the commit it was read at, or why it could not be read. */
export type GraphRead = { graph: PackGraph; commit: string } | { error: string };

/** Where the check reads a pack's graph: the real reads, or a test's stand-ins. */
export interface GraphSource {
  /** The pack installed in `plugins`. */
  installed: (plugins: string, packKey: string, pin: PackPin) => GraphRead;
  /** The pack at its pinned commit. */
  pinned: (packKey: string, pin: PackPin) => GraphRead;
}

/**
 * Why `archon pack graph --json` failed, in the CLI's own words: it prints `{ ok: false, error }`
 * on stdout. Output of any other shape is kept as written, so the evidence is not lost.
 */
function cliError(stdout: string, exitCode: number): string {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (typeof parsed === 'object' && parsed !== null && 'error' in parsed)
      return String(parsed.error);
  } catch {
    // Not JSON: the raw text below is the evidence.
  }
  return stdout.trim() || `exited ${String(exitCode)} with no output`;
}

/**
 * `archon pack graph <pack key> --json` on a throwaway home whose `plugins/` is `fill`ed, or why
 * it failed. `loaded` and `otherCopies` name the throwaway paths, so they are dropped.
 */
function graphOnScratchHome(
  packKey: string,
  fill: (plugins: string) => void
): { graph: PackGraph } | { error: string } {
  const scratch = mkdtempSync(join(tmpdir(), 'factory-view-home-'));
  try {
    fill(getPluginsPath(scratch));
    const read = Bun.spawnSync(
      ['bun', 'run', 'cli', 'pack', 'graph', packKey, '--cwd', root, '--json'],
      {
        cwd: root,
        stderr: 'inherit',
        // The child reads the scratch home only; '' keeps `.env` loading from restoring a live one.
        env: { ...process.env, ARCHON_HOME: scratch, ARCHON_FACTORY_LIVE_HOME: '' },
      }
    );
    const stdout = read.stdout.toString();
    if (read.exitCode !== 0) return { error: cliError(stdout, read.exitCode) };
    const graph = packGraphSchema.parse(JSON.parse(stdout));
    return { graph: { ...graph, loaded: [], otherCopies: [] } };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** The commit of `repo` installed in `plugins`, from its receipt; undefined when none is. */
function installedCommit(plugins: string, repo: string): string | undefined {
  const path = receiptPath(plugins, repo);
  if (!existsSync(path)) return undefined;
  const receipt = workflowPackReceiptSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  return receipt.success ? receipt.data.commit : undefined;
}

/** The pack installed in `plugins`, read on a throwaway copy of it. */
export function installedGraph(plugins: string, packKey: string, pin: PackPin): GraphRead {
  const commit = installedCommit(plugins, pin.repo);
  const read = graphOnScratchHome(packKey, scratch => {
    // A `plugins` that does not exist is not copied, so the CLI gives its own reason.
    if (existsSync(plugins)) cpSync(plugins, scratch, { recursive: true });
  });
  if ('error' in read) return read;
  return commit === undefined
    ? { error: `no receipt in ${plugins} names the commit of ${pin.repo}` }
    : { graph: read.graph, commit };
}

const git = (args: string[], cwd: string): void => {
  const run = Bun.spawnSync(['git', '-c', 'core.autocrlf=false', ...args], {
    cwd,
    stdout: 'ignore',
    stderr: 'pipe',
  });
  if (run.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${run.stderr.toString().trim()}`);
};

/**
 * Fetches `pin.commit` of `pin.repo` at depth 1 and writes it where an install puts it: the tree
 * under `packTreePath` and a receipt naming the commit, built from the tree's own manifest.
 */
function installPinned(plugins: string, pin: PackPin): void {
  const tree = packTreePath(plugins, pin.repo, pin.commit);
  mkdirSync(tree, { recursive: true });
  git(['init', '-q'], tree);
  git(['fetch', '-q', '--depth', '1', `https://github.com/${pin.repo}.git`, pin.commit], tree);
  git(['checkout', '-q', 'FETCH_HEAD'], tree);
  rmSync(join(tree, '.git'), { recursive: true, force: true });
  const receipt = workflowPackReceiptSchema.parse({
    schemaVersion: 1,
    id: pin.repo,
    manifest: JSON.parse(readFileSync(join(tree, 'archon-plugin.json'), 'utf8')),
    commit: pin.commit,
    installedAt: new Date().toISOString(),
  });
  const path = receiptPath(plugins, pin.repo);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`);
}

/** The pack at its pinned commit, fetched into a throwaway home. */
export function pinnedGraph(packKey: string, pin: PackPin): GraphRead {
  try {
    const read = graphOnScratchHome(packKey, plugins => {
      installPinned(plugins, pin);
    });
    return 'error' in read ? read : { graph: read.graph, commit: pin.commit };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

const line = (kind: string, finding: { path: PropertyKey[]; message: string }): string =>
  `${finding.path.map(String).join('.') || '(view)'}: [${kind}] ${finding.message}`;

/** One file's findings, each as a `path: [kind] message` line. */
interface FileResult {
  file: string;
  /** Empty when the file is clean. */
  fails: string[];
  warns: string[];
}

const asLines = (file: string, check: NameCheck, pre: string[] = []): FileResult => ({
  file,
  fails: [...pre, ...check.fails.map(finding => line('fail', finding))],
  warns: check.warns.map(finding => line('warn', finding)),
});

/** The graph a pack is checked against, or the lines saying why there is none. */
function readGraph(
  packsDir: string,
  packKey: string,
  plugins: string | undefined,
  source: GraphSource
): { graph: PackGraph } | { fails: string[] } {
  const pinPath = join(packsDir, `${packKey}${PIN_SUFFIX}`);
  if (!existsSync(pinPath))
    return { fails: [`${pinPath}: [pin] missing; it names the pack's repo and commit`] };
  const pin = parsePin(readJson(pinPath));
  if ('problems' in pin)
    return { fails: pin.problems.map(problem => `${pinPath}: [pin] ${problem}`) };
  if (plugins === undefined) {
    const read = source.pinned(packKey, pin);
    return 'error' in read
      ? {
          fails: [`${pinPath}: [pin] could not read ${pin.repo} at ${pin.commit}: ${read.error}`],
        }
      : { graph: read.graph };
  }
  // Naming a home says the pack is installed there, and the CLI decides whether it is: a quiet
  // fallback to the pin would hide that it is not.
  const read = source.installed(plugins, packKey, pin);
  if ('error' in read)
    return {
      fails: [
        `${plugins}: [install] \`archon pack graph ${packKey}\` could not read the pack there: ${read.error} ` +
          'Install the pack in that home, or unset ARCHON_FACTORY_LIVE_HOME and ARCHON_HOME to check the pinned commit.',
      ],
    };
  if (read.commit !== pin.commit)
    return {
      fails: [
        `${pinPath}: [pin] the pack installed in ${plugins} is at ${read.commit}, the pin at ${pin.commit}; ` +
          `run \`bun run check:factory-view --pin ${packKey}\` and commit it`,
      ],
    };
  return { graph: read.graph };
}

/** A view file and, when there is one, its overview file, checked against their pack's graph. */
function checkPack(
  packsDir: string,
  viewFile: string,
  plugins: string | undefined,
  source: GraphSource
): FileResult[] {
  const packKey = viewFile.slice(0, -FACTORY_VIEW_PROJECT_SUFFIX.length);
  const overviewFile = `${packKey}${FACTORY_OVERVIEW_PROJECT_SUFFIX}`;
  const view = factoryViewSchema.safeParse(readJson(join(packsDir, viewFile)));
  const overview = existsSync(join(packsDir, overviewFile))
    ? factoryOverviewSchema.safeParse(readJson(join(packsDir, overviewFile)))
    : undefined;
  const results: FileResult[] = [];
  const schemaFails = (
    file: string,
    issues: readonly { path: PropertyKey[]; message: string }[]
  ): void => {
    results.push({ file, fails: issues.map(issue => line('schema', issue)), warns: [] });
  };
  if (!view.success) schemaFails(viewFile, view.error.issues);
  if (overview !== undefined && !overview.success) schemaFails(overviewFile, overview.error.issues);
  if (!view.success) return results;
  const read = readGraph(packsDir, packKey, plugins, source);
  if ('fails' in read) return [...results, { file: viewFile, fails: read.fails, warns: [] }];
  results.push(asLines(viewFile, checkViewNames(view.data, read.graph)));
  if (overview?.success === true)
    results.push(asLines(overviewFile, checkOverviewEdges(overview.data, view.data, read.graph)));
  return results;
}

interface CheckInput {
  /** The directory holding the view, overview and pin files. */
  packsDir: string;
  /** The named home's `plugins/`, or undefined to fetch each pack at its pinned commit. */
  plugins: string | undefined;
  source: GraphSource;
}

/** What the check prints, `out` on stdout and `err` on stderr, and its exit code. */
interface CheckReport {
  code: 0 | 1;
  out: string[];
  err: string[];
}

/** Checks every view file in `packsDir`, reading each pack's graph only through `source`. */
export function runCheck({ packsDir, plugins, source }: CheckInput): CheckReport {
  const out = [
    plugins === undefined
      ? 'No home named (ARCHON_FACTORY_LIVE_HOME and ARCHON_HOME are unset or empty): reading each pack at its pinned commit.'
      : `Reading each pack from ${plugins}, and checking it is at its pinned commit.`,
  ];
  const err: string[] = [];
  const files = readdirSync(packsDir).filter(name => name.endsWith(FACTORY_VIEW_PROJECT_SUFFIX));
  for (const { file, fails, warns } of files.flatMap(f =>
    checkPack(packsDir, f, plugins, source)
  )) {
    if (fails.length === 0) out.push(`${file}: agrees with the pack graph`);
    else err.push(`${file}:`, ...fails.map(entry => `  ${entry}`));
    if (warns.length > 0)
      out.push(
        `${file}: what the pack graph has and the file leaves out (warnings):`,
        ...warns.map(entry => `  ${entry}`)
      );
  }
  return { code: err.length === 0 ? 0 : 1, out, err };
}

const realSource: GraphSource = { installed: installedGraph, pinned: pinnedGraph };

/** Prints the check over this checkout's `.archon/packs/` and returns its exit code. */
function check(): number {
  const report = runCheck({
    packsDir: packs,
    plugins: namedPlugins(process.env),
    source: realSource,
  });
  for (const entry of report.out) console.log(entry);
  for (const entry of report.err) console.error(entry);
  return report.code;
}

/** Rewrites the pack's pin to the commit installed in the named home. */
function pin(packKey: string): number {
  const plugins = namedPlugins(process.env);
  if (plugins === undefined) {
    console.error(
      'No home named: set ARCHON_FACTORY_LIVE_HOME or ARCHON_HOME to the home the pack is installed in.'
    );
    return 1;
  }
  const path = join(packs, `${packKey}${PIN_SUFFIX}`);
  const current = parsePin(readJson(path));
  if ('problems' in current) {
    console.error(`${path}: ${current.problems.join('; ')}`);
    return 1;
  }
  const commit = installedCommit(plugins, current.repo);
  if (commit === undefined) {
    console.error(
      `${plugins}: no receipt names the commit of ${current.repo}; install it there first.`
    );
    return 1;
  }
  writeFileSync(path, `${JSON.stringify({ ...current, commit }, null, 2)}\n`);
  console.log(`Pinned ${current.repo} at ${commit} in ${path}`);
  return 0;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--pin');
  if (at === -1) process.exit(check());
  const packKey = args[at + 1];
  if (packKey === undefined) {
    console.error('Usage: bun run check:factory-view [--pin <pack key>]');
    process.exit(2);
  }
  process.exit(pin(packKey));
}

/**
 * `bun run check:factory-view`: checks each project factory view
 * (`.archon/packs/<pack key>.factory-view.json`) against its pack's real workflows and
 * hand-offs (`factoryViewCoverage`). It exits 1 on any finding. CI runs it in the
 * generated-files group of `scripts/validate.ts`.
 *
 * The pack's graph comes from two places, so neither can drift unseen:
 * - The committed snapshot beside the view (`<pack key>.pack-graph.json`): what CI, which has
 *   no install, checks against. A missing snapshot is a finding.
 * - The installed pack, when a home is named: ARCHON_FACTORY_LIVE_HOME, else ARCHON_HOME. The
 *   view is then checked against the pack the CLI reads from that home's `plugins/`, and a
 *   snapshot that differs from it is a finding, so a reinstall that changes the pack fails the
 *   check here (the factory's own validate command runs it) before it can mislead CI. When the
 *   CLI cannot read the pack there (no `plugins/`, or no such pack in it), the check fails with
 *   the CLI's reason rather than falling back to the snapshot: the CLI alone decides whether
 *   the pack is installed.
 *
 * The installed graph is `archon pack graph <pack key> --json` run on a throwaway home holding a
 * copy of that `plugins/` and nothing else: the install is only read, and with no trigger files
 * every arrow is one the pack declares and no machine path reaches the snapshot.
 * `--write <pack key>` rewrites the snapshot from it after a reinstall.
 *
 * Only the workflows a view's stages list are compared, steps, hand-offs and outcomes alike;
 * the check names the pack's other workflows on an informational line that is not a finding.
 */
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { getPluginsPath } from '@archon/paths';
import {
  factoryViewCoverage,
  unlistedWorkflows,
} from '../packages/workflows/src/factory-view-coverage';
import { type PackGraph, packGraphSchema } from '../packages/workflows/src/pack-graph';
import {
  FACTORY_VIEW_PROJECT_SUFFIX,
  factoryViewSchema,
} from '../packages/workflows/src/schemas/factory-view';

const root = resolve(import.meta.dir, '..');
const packs = join(root, '.archon', 'packs');
const SNAPSHOT_SUFFIX = '.pack-graph.json';

/** The `plugins/` of the home `env` names, whether or not it exists; undefined when none is. */
export function namedPlugins(env: Record<string, string | undefined>): string | undefined {
  const home = env.ARCHON_FACTORY_LIVE_HOME || env.ARCHON_HOME;
  return home ? getPluginsPath(home) : undefined;
}

/** What reading the installed pack gave: its graph, or why it could not be read. */
export type InstalledRead = { graph: PackGraph } | { error: string };

/** Reads one pack from a `plugins/` directory: `installedGraph`, or a test's stand-in. */
export type ReadInstalled = (plugins: string, packKey: string) => InstalledRead;

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
 * The graph as the snapshot holds it: the pack alone. `loaded` and `otherCopies` say where the
 * CLI found its copies, which for `installedGraph` is a throwaway home's temporary path, new on
 * every read: kept, no snapshot could ever equal the install, and a machine path would reach
 * the committed file.
 */
export function packShape(graph: PackGraph): PackGraph {
  return { ...graph, loaded: [], otherCopies: [] };
}

/**
 * The installed pack's graph (`packShape`), read on a throwaway copy of `plugins`, or why it
 * could not be.
 * A `plugins` that does not exist is not copied, so the CLI gives its own reason.
 */
export function installedGraph(plugins: string, packKey: string): InstalledRead {
  const scratch = mkdtempSync(join(tmpdir(), 'factory-view-home-'));
  try {
    if (existsSync(plugins)) cpSync(plugins, getPluginsPath(scratch), { recursive: true });
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
    return { graph: packShape(packGraphSchema.parse(JSON.parse(stdout))) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

/** A named home whose `plugins/` cannot give the pack: what the CLI said, and what to do next. */
const notInstalled = (packKey: string, plugins: string, error: string): string =>
  `${plugins}: [install] \`archon pack graph ${packKey}\` could not read the pack there: ${error} ` +
  'Install the pack in that home, or unset ARCHON_FACTORY_LIVE_HOME and ARCHON_HOME to check against the committed snapshot.';

/** One declaration's checks: its findings as `path: message` lines, and what it leaves out. */
interface FileResult {
  /** Empty when the declaration is clean. */
  findings: string[];
  /** The pack's workflows no stage lists, so never compared; empty when no graph was read. */
  unlisted: string[];
}

function checkOne(
  packsDir: string,
  file: string,
  plugins: string | undefined,
  readInstalled: ReadInstalled
): FileResult {
  const packKey = file.slice(0, -FACTORY_VIEW_PROJECT_SUFFIX.length);
  const parsed = factoryViewSchema.safeParse(readJson(join(packsDir, file)));
  if (!parsed.success) {
    const findings = parsed.error.issues.map(
      i => `${i.path.join('.') || '(view)'}: [schema] ${i.message}`
    );
    return { findings, unlisted: [] };
  }
  const snapshotPath = join(packsDir, `${packKey}${SNAPSHOT_SUFFIX}`);
  const snapshot = existsSync(snapshotPath)
    ? packGraphSchema.parse(readJson(snapshotPath))
    : undefined;
  const read = plugins === undefined ? undefined : readInstalled(plugins, packKey);
  // Naming a home says the pack is installed there, and the CLI decides whether it is: a quiet
  // fallback to the snapshot would hide that it is not.
  if (plugins !== undefined && read !== undefined && 'error' in read)
    return { findings: [notInstalled(packKey, plugins, read.error)], unlisted: [] };
  const installed = read !== undefined && 'graph' in read ? read.graph : undefined;
  const findings: string[] = [];
  const refresh = `run \`bun run check:factory-view --write ${packKey}\``;
  if (snapshot === undefined) findings.push(`${snapshotPath}: [snapshot] missing; ${refresh}`);
  else if (installed !== undefined && !Bun.deepEquals(snapshot, installed))
    findings.push(
      `${snapshotPath}: [snapshot] differs from the pack installed in ${plugins}; ${refresh} and commit it`
    );
  const graph = installed ?? snapshot;
  if (graph === undefined) return { findings, unlisted: [] };
  for (const finding of factoryViewCoverage(parsed.data, graph))
    findings.push(`${finding.path.join('.') || '(view)'}: [${finding.kind}] ${finding.message}`);
  return { findings, unlisted: unlistedWorkflows(parsed.data, graph) };
}

interface CheckInput {
  /** The directory holding the view files and their snapshots. */
  packsDir: string;
  /** The named home's `plugins/`, or undefined to check against the snapshots only. */
  plugins: string | undefined;
  readInstalled: ReadInstalled;
}

/** What the check prints, `out` on stdout and `err` on stderr, and its exit code. */
interface CheckReport {
  code: 0 | 1;
  out: string[];
  err: string[];
}

/** Checks every view file in `packsDir`, reading the installed pack only through `readInstalled`. */
export function runCheck({ packsDir, plugins, readInstalled }: CheckInput): CheckReport {
  const out = [
    plugins === undefined
      ? 'No home named (ARCHON_FACTORY_LIVE_HOME and ARCHON_HOME are unset or empty): checking against the committed snapshots only.'
      : `Reading each pack from ${plugins}, and checking each snapshot against it.`,
  ];
  const err: string[] = [];
  const files = readdirSync(packsDir).filter(name => name.endsWith(FACTORY_VIEW_PROJECT_SUFFIX));
  for (const file of files) {
    const { findings, unlisted } = checkOne(packsDir, file, plugins, readInstalled);
    if (findings.length === 0)
      out.push(`${file}: covers every step, hand-off and outcome of the workflows its stages list`);
    else err.push(`${file}:`, ...findings.map(line => `  ${line}`));
    // Information, not a finding: no step or hand-off of these workflows is compared.
    if (unlisted.length > 0)
      out.push(`${file}: not compared, since no stage lists them: ${unlisted.join(', ')}`);
  }
  return { code: err.length === 0 ? 0 : 1, out, err };
}

/** Prints the check over this checkout's `.archon/packs/` and returns its exit code. */
function check(): number {
  const report = runCheck({
    packsDir: packs,
    plugins: namedPlugins(process.env),
    readInstalled: installedGraph,
  });
  for (const line of report.out) console.log(line);
  for (const line of report.err) console.error(line);
  return report.code;
}

/** Rewrites the pack's snapshot from the installed pack. */
function write(packKey: string): number {
  const plugins = namedPlugins(process.env);
  if (plugins === undefined) {
    console.error(
      'No home named: set ARCHON_FACTORY_LIVE_HOME or ARCHON_HOME to the home the pack is installed in.'
    );
    return 1;
  }
  const read = installedGraph(plugins, packKey);
  if ('error' in read) {
    console.error(notInstalled(packKey, plugins, read.error));
    return 1;
  }
  const target = join(packs, `${packKey}${SNAPSHOT_SUFFIX}`);
  writeFileSync(target, `${JSON.stringify(read.graph, null, 2)}\n`);
  console.log(`Wrote ${target} from the pack installed in ${plugins}`);
  return 0;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--write');
  if (at === -1) process.exit(check());
  const packKey = args[at + 1];
  if (packKey === undefined) {
    console.error('Usage: bun run check:factory-view [--write <pack key>]');
    process.exit(2);
  }
  process.exit(write(packKey));
}

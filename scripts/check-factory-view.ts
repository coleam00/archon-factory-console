/**
 * `bun run check:factory-view <pack dir> [--view <file>]`: checks a pack's factory view file
 * (`<pack dir>/.shared/factory-view.json`, or the `--view` file) against the pack's graph,
 * with the same `checkFactoryView` the view route runs. It exits 1 on any error (a name the
 * graph lacks, a file that does not validate, a graph it could not read) and prints warnings
 * (what the graph has and the file leaves out) while still passing.
 *
 * The graph is `archon pack graph <name> --workflow-source <pack dir> --json`, the read
 * `GET /api/packs/{pack}/graph` answers from, run on a throwaway home: the pack folder is only
 * read, and no live home is.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkFactoryView } from '../packages/workflows/src/factory-view-check';
import { type PackGraph, packGraphSchema } from '../packages/workflows/src/pack-graph';
import { factoryViewFileSchema } from '../packages/workflows/src/schemas/factory-view';

const root = resolve(import.meta.dir, '..');

/** Where the check reads a pack folder's graph: the CLI, or a test's stand-in. */
export type GraphSource = (packDir: string) => { graph: PackGraph } | { error: string };

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

/** The pack folder's graph from the CLI, on a throwaway home that is removed after. */
export const cliGraph: GraphSource = packDir => {
  const manifest: unknown = JSON.parse(readFileSync(join(packDir, 'archon-plugin.json'), 'utf8'));
  const name =
    typeof manifest === 'object' && manifest !== null && 'name' in manifest
      ? String(manifest.name)
      : undefined;
  if (name === undefined) return { error: `${packDir}/archon-plugin.json names no pack` };
  const scratch = mkdtempSync(join(tmpdir(), 'factory-view-home-'));
  try {
    const read = Bun.spawnSync(
      [
        'bun',
        'run',
        'cli',
        'pack',
        'graph',
        name,
        '--workflow-source',
        packDir,
        '--cwd',
        root,
        '--json',
      ],
      {
        cwd: root,
        stderr: 'inherit',
        // The child reads the scratch home only; '' keeps `.env` loading from restoring a live one.
        env: { ...process.env, ARCHON_HOME: scratch, ARCHON_FACTORY_LIVE_HOME: '' },
      }
    );
    const stdout = read.stdout.toString();
    if (read.exitCode !== 0) return { error: cliError(stdout, read.exitCode) };
    return { graph: packGraphSchema.parse(JSON.parse(stdout)) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
};

/** What the check prints, and its exit code. */
export interface CheckReport {
  code: 0 | 1;
  lines: string[];
}

const line = (finding: { severity: string; path: PropertyKey[]; message: string }): string =>
  `${finding.path.map(String).join('.') || '(file)'}: [${finding.severity}] ${finding.message}`;

/** Checks `viewPath` against the graph of `packDir`, read through `source`. */
export function runCheck(packDir: string, viewPath: string, source: GraphSource): CheckReport {
  if (!existsSync(viewPath)) return { code: 1, lines: [`${viewPath}: no factory view file`] };
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(viewPath, 'utf8'));
  } catch (error) {
    return { code: 1, lines: [`${viewPath}: not JSON: ${(error as Error).message}`] };
  }
  const parsed = factoryViewFileSchema.safeParse(json);
  if (!parsed.success)
    return {
      code: 1,
      lines: parsed.error.issues.map(
        issue => `${viewPath}: ${line({ severity: 'error', ...issue })}`
      ),
    };
  const read = source(packDir);
  if ('error' in read)
    return { code: 1, lines: [`${packDir}: could not read the pack graph: ${read.error}`] };
  const problems = checkFactoryView(parsed.data, read.graph);
  const errors = problems.filter(p => p.severity === 'error');
  const warnings = problems.filter(p => p.severity === 'warning');
  return {
    code: errors.length === 0 ? 0 : 1,
    lines: [
      `Checking ${viewPath} against the graph of pack "${read.graph.pack}" read from ${packDir}`,
      ...errors.map(line),
      ...warnings.map(line),
      `${String(errors.length)} errors, ${String(warnings.length)} warnings`,
    ],
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--view');
  const view = at === -1 ? undefined : args[at + 1];
  const [dir, ...extra] = at === -1 ? args : [...args.slice(0, at), ...args.slice(at + 2)];
  if (dir === undefined || extra.length > 0 || (at !== -1 && view === undefined)) {
    console.error('Usage: bun run check:factory-view <pack dir> [--view <file>]');
    process.exit(2);
  }
  const packDir = resolve(dir);
  const report = runCheck(
    packDir,
    view === undefined ? join(packDir, '.shared', 'factory-view.json') : resolve(view),
    cliGraph
  );
  for (const entry of report.lines) (report.code === 0 ? console.log : console.error)(entry);
  process.exit(report.code);
}

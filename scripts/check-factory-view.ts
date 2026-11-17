/**
 * `bun run check:factory-view`: checks each project factory view
 * (`.archon/packs/<pack key>.factory-view.json`) against its pack's real workflows and
 * hand-offs (`factoryViewCoverage`). It exits 1 on any finding. CI runs it in the
 * generated-files group of `scripts/validate.ts`.
 *
 * The pack's graph comes from two places, so neither can drift unseen:
 * - The committed snapshot beside the view (`<pack key>.pack-graph.json`): what CI, which has
 *   no install, checks against. A missing snapshot is a finding.
 * - The installed pack, when this machine has one: the `plugins/` of ARCHON_FACTORY_LIVE_HOME,
 *   else of ARCHON_HOME. The view is then checked against the installed pack's graph, and a
 *   snapshot that differs from it is a finding, so a reinstall that changes the pack fails the
 *   check here (the factory's own validate command runs it) before it can mislead CI.
 *
 * The installed graph is `archon pack graph <pack key> --json` run on a throwaway home holding a
 * copy of that `plugins/` and nothing else: the install is only read, and with no trigger files
 * every arrow is one the pack declares and no machine path reaches the snapshot.
 * `--write <pack key>` rewrites the snapshot from it after a reinstall.
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
import { factoryViewCoverage } from '../packages/workflows/src/factory-view-coverage';
import { type PackGraph, packGraphSchema } from '../packages/workflows/src/pack-graph';
import {
  FACTORY_VIEW_PROJECT_SUFFIX,
  factoryViewSchema,
} from '../packages/workflows/src/schemas/factory-view';

const root = resolve(import.meta.dir, '..');
const packs = join(root, '.archon', 'packs');
const SNAPSHOT_SUFFIX = '.pack-graph.json';

/** The installed packs this machine has, or undefined when no home is named or it has none. */
function installedPlugins(): string | undefined {
  const home = process.env.ARCHON_FACTORY_LIVE_HOME || process.env.ARCHON_HOME;
  if (!home) return undefined;
  const plugins = getPluginsPath(home);
  return existsSync(plugins) ? plugins : undefined;
}

/** The installed pack's graph, read on a throwaway copy of `plugins`; throws when it cannot be read. */
function installedGraph(plugins: string, packKey: string): PackGraph {
  const scratch = mkdtempSync(join(tmpdir(), 'factory-view-home-'));
  try {
    cpSync(plugins, getPluginsPath(scratch), { recursive: true });
    const read = Bun.spawnSync(
      ['bun', 'run', 'cli', 'pack', 'graph', packKey, '--cwd', root, '--json'],
      { cwd: root, stderr: 'inherit', env: { ...process.env, ARCHON_HOME: scratch } }
    );
    if (read.exitCode !== 0)
      throw new Error(`archon pack graph ${packKey} exited ${String(read.exitCode)} on ${plugins}`);
    return packGraphSchema.parse(JSON.parse(read.stdout.toString()));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

/** Every finding of one declaration as `path: message` lines; empty when it is clean. */
function checkOne(file: string, plugins: string | undefined): string[] {
  const packKey = file.slice(0, -FACTORY_VIEW_PROJECT_SUFFIX.length);
  const parsed = factoryViewSchema.safeParse(readJson(join(packs, file)));
  if (!parsed.success)
    return parsed.error.issues.map(i => `${i.path.join('.') || '(view)'}: [schema] ${i.message}`);
  const snapshotPath = join(packs, `${packKey}${SNAPSHOT_SUFFIX}`);
  const snapshot = existsSync(snapshotPath)
    ? packGraphSchema.parse(readJson(snapshotPath))
    : undefined;
  const installed = plugins === undefined ? undefined : installedGraph(plugins, packKey);
  const lines: string[] = [];
  const refresh = `run \`bun run check:factory-view --write ${packKey}\``;
  if (snapshot === undefined) lines.push(`${snapshotPath}: [snapshot] missing; ${refresh}`);
  else if (installed !== undefined && !Bun.deepEquals(snapshot, installed))
    lines.push(
      `${snapshotPath}: [snapshot] differs from the pack installed in ${plugins}; ${refresh} and commit it`
    );
  const graph = installed ?? snapshot;
  if (graph !== undefined)
    for (const finding of factoryViewCoverage(parsed.data, graph))
      lines.push(`${finding.path.join('.') || '(view)'}: [${finding.kind}] ${finding.message}`);
  return lines;
}

function check(): number {
  const plugins = installedPlugins();
  console.log(
    plugins === undefined
      ? 'No installed packs (ARCHON_FACTORY_LIVE_HOME and ARCHON_HOME name no plugins/): checking against the committed snapshots only.'
      : `Checking against the packs installed in ${plugins}, and each snapshot against them.`
  );
  const files = readdirSync(packs).filter(name => name.endsWith(FACTORY_VIEW_PROJECT_SUFFIX));
  let failed = 0;
  for (const file of files) {
    const lines = checkOne(file, plugins);
    if (lines.length === 0) {
      console.log(`${file}: covers every step and hand-off of its pack`);
      continue;
    }
    failed += 1;
    console.error(`${file}:`);
    for (const line of lines) console.error(`  ${line}`);
  }
  return failed === 0 ? 0 : 1;
}

/** Rewrites the pack's snapshot from the installed pack. */
function write(packKey: string): number {
  const plugins = installedPlugins();
  if (plugins === undefined) {
    console.error(
      'No installed packs: set ARCHON_FACTORY_LIVE_HOME or ARCHON_HOME to the home the pack is installed in.'
    );
    return 1;
  }
  const target = join(packs, `${packKey}${SNAPSHOT_SUFFIX}`);
  writeFileSync(target, `${JSON.stringify(installedGraph(plugins, packKey), null, 2)}\n`);
  console.log(`Wrote ${target} from the pack installed in ${plugins}`);
  return 0;
}

const args = process.argv.slice(2);
const at = args.indexOf('--write');
if (at === -1) process.exit(check());
const packKey = args[at + 1];
if (packKey === undefined) {
  console.error('Usage: bun run check:factory-view [--write <pack key>]');
  process.exit(2);
}
process.exit(write(packKey));

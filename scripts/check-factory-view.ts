/**
 * `bun run check:factory-view`: checks each project factory view
 * (`.archon/packs/<pack key>.factory-view.json`) against its pack's real workflows and
 * hand-offs (`factoryViewCoverage`), read from the graph snapshot beside it
 * (`<pack key>.pack-graph.json`). It exits 1 on any finding or a missing snapshot. CI runs it
 * in the generated-files group of `scripts/validate.ts`.
 *
 * The snapshot is `archon pack graph <pack key> --json` for the installed pack on a home with
 * no trigger files: every arrow is one the pack declares. Nothing refreshes it when the pack is
 * reinstalled. Refresh it on a scratch home, never on the live factory's:
 *
 *   T=$(mktemp -d); mkdir -p $T/home; cp -r ~/.archon-fc/plugins $T/home/
 *   ARCHON_HOME=$(cygpath -w $T/home) bun run check:factory-view --write Wirasm.archon-software-factory
 *
 * `--write` refuses the home ARCHON_FACTORY_LIVE_HOME names, so leave that variable set.
 * (`bun run dev:console`'s `.console-home/` holds a copy of the plugins too.)
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { factoryViewCoverage } from '../packages/workflows/src/factory-view-coverage';
import { packGraphSchema } from '../packages/workflows/src/pack-graph';
import {
  FACTORY_VIEW_PROJECT_SUFFIX,
  factoryViewSchema,
} from '../packages/workflows/src/schemas/factory-view';

const root = resolve(import.meta.dir, '..');
const packs = join(root, '.archon', 'packs');
const SNAPSHOT_SUFFIX = '.pack-graph.json';

/** Every finding of one declaration as `path: message` lines; empty when it is clean. */
function checkOne(file: string): string[] {
  const packKey = file.slice(0, -FACTORY_VIEW_PROJECT_SUFFIX.length);
  const snapshot = join(packs, `${packKey}${SNAPSHOT_SUFFIX}`);
  let graphText: string;
  try {
    graphText = readFileSync(snapshot, 'utf8');
  } catch {
    return [
      `no pack graph snapshot at ${snapshot}; write one with \`bun run check:factory-view --write ${packKey}\` on a scratch home`,
    ];
  }
  const view = factoryViewSchema.parse(JSON.parse(readFileSync(join(packs, file), 'utf8')));
  const graph = packGraphSchema.parse(JSON.parse(graphText));
  return factoryViewCoverage(view, graph).map(
    finding => `${finding.path.join('.') || '(view)'}: [${finding.kind}] ${finding.message}`
  );
}

function check(): number {
  const files = readdirSync(packs).filter(name => name.endsWith(FACTORY_VIEW_PROJECT_SUFFIX));
  let failed = 0;
  for (const file of files) {
    const lines = checkOne(file);
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

/**
 * Writes the pack's graph snapshot: `archon pack graph <pack key> --json` from this checkout,
 * on the scratch home `ARCHON_HOME` names. A home with trigger files is refused, so every arrow
 * is one the pack declares and no machine path from an install's files lands in the commit.
 */
async function write(packKey: string): Promise<number> {
  const { liveHomeRefusal } = await import('../packages/server/src/boot/live-home-guard');
  if (liveHomeRefusal() !== null) {
    console.error(
      "Refusing: ARCHON_HOME is the live factory's home. Copy its plugins/ into a scratch home and point ARCHON_HOME there (see this script's header)."
    );
    return 1;
  }
  const read = Bun.spawnSync(
    ['bun', 'run', 'cli', 'pack', 'graph', packKey, '--cwd', root, '--json'],
    { cwd: root, stderr: 'inherit' }
  );
  if (read.exitCode !== 0) return read.exitCode;
  const graph = packGraphSchema.parse(JSON.parse(read.stdout.toString()));
  if (graph.arrows.some(arrow => arrow.active)) {
    console.error(
      'Refusing: this home has trigger files for the pack. Use a scratch home with only plugins/ copied in.'
    );
    return 1;
  }
  const target = join(packs, `${packKey}${SNAPSHOT_SUFFIX}`);
  writeFileSync(target, `${JSON.stringify(graph, null, 2)}\n`);
  console.log(`Wrote ${target}`);
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
process.exit(await write(packKey));

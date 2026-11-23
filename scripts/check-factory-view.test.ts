import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPluginsPath } from '@archon/paths';
import { trackTempRoots } from '@archon/paths/test-utils';
import type { PackGraph } from '../packages/workflows/src/pack-graph';
import { FACTORY_VIEW_PROJECT_SUFFIX } from '../packages/workflows/src/schemas/factory-view';
import {
  type InstalledRead,
  installedGraph,
  packShape,
  namedPlugins,
  type ReadInstalled,
  runCheck,
} from './check-factory-view';

const trackTempRoot = trackTempRoots();
const tempDir = (prefix: string): string =>
  trackTempRoot(mkdtempSync(join(tmpdir(), `check-factory-view-${prefix}-`)));

const node = (id: string): PackGraph['stages'][number]['nodes'][number] => ({
  id,
  kind: 'agent',
  dependsOn: [],
  loopGroup: null,
  blocks: [],
  fanOut: null,
});

/** Pack `o.p`: `plan`, which the view lists, and `discoveries`, which no stage lists. */
const graph = (): PackGraph => ({
  pack: 'o.p',
  loaded: [],
  otherCopies: [],
  stages: [
    { name: 'o/p:plan', returns: 'plan', outcome: null, asks: false, nodes: [node('plan')] },
    {
      name: 'o/p:discoveries',
      returns: 'drain',
      outcome: null,
      asks: false,
      nodes: [node('drain')],
    },
  ],
  arrows: [],
  fanOutBlocks: [],
  discoveryErrors: [],
});

/** A view clean against `graph()`, so the cases differ only in how the pack is read. */
const view = {
  version: 1,
  pack: 'o/p',
  title: 'Factory',
  summary: 'Items in, changes out.',
  stages: [
    {
      id: 'plan',
      label: 'Plan',
      blurb: 'Plans.',
      group: 'intake',
      workflows: ['plan'],
      drilldown: {
        phases: [
          {
            label: 'Plan',
            cards: [
              {
                title: 'plan',
                text: 'Plans.',
                icon: 'pencil',
                kind: 'agent',
                covers: [{ workflow: 'plan', steps: ['plan'] }],
              },
            ],
          },
        ],
      },
    },
    { id: 'landed', label: 'Landed', blurb: 'Merged.', group: 'land', workflows: [] },
  ],
  placement: {},
  endings: {},
  landed: { stage: 'landed' },
  map: { cards: [], arrows: [{ from: 'plan', to: 'landed' }] },
};

const VIEW_FILE = `o.p${FACTORY_VIEW_PROJECT_SUFFIX}`;
const PLUGINS = join('home', 'plugins');

/** A packs directory holding the view and its snapshot of `graph()`. */
function packsDir(): string {
  const dir = tempDir('packs');
  writeFileSync(join(dir, VIEW_FILE), JSON.stringify(view));
  writeFileSync(join(dir, 'o.p.pack-graph.json'), JSON.stringify(graph()));
  return dir;
}

/** A stand-in for `installedGraph` that answers `read` and records its calls. */
function reader(read: InstalledRead): { readInstalled: ReadInstalled; calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    readInstalled: (plugins, packKey) => {
      calls.push([plugins, packKey]);
      return read;
    },
  };
}

describe('runCheck', () => {
  test('with no home named, checks the snapshot and names the workflows it does not compare', () => {
    const report = runCheck({
      packsDir: packsDir(),
      plugins: undefined,
      readInstalled: () => {
        throw new Error('no home is named, so nothing is installed to read');
      },
    });
    expect(report.err).toEqual([]);
    expect(report.code).toBe(0);
    // Informational, so on stdout with a clean exit; the wording is free to change.
    expect(report.out.some(line => line.includes('o/p:discoveries'))).toBe(true);
  });

  test("fails with the reader's reason when the named home cannot give the pack", () => {
    const report = runCheck({
      packsDir: packsDir(),
      plugins: PLUGINS,
      ...reader({ error: 'stub reason' }),
    });
    expect(report.code).toBe(1);
    const install = report.err.find(line => line.includes('[install]'));
    expect(install).toContain('stub reason');
  });

  test('fails when the installed pack differs from the snapshot', () => {
    const installed = graph();
    installed.stages[1]?.nodes.push(node('extra'));
    const report = runCheck({
      packsDir: packsDir(),
      plugins: PLUGINS,
      ...reader({ graph: installed }),
    });
    expect(report.code).toBe(1);
    expect(report.err.some(line => line.includes('[snapshot]'))).toBe(true);
  });

  test('reads the pack from the named plugins and passes when it equals the snapshot', () => {
    const { readInstalled, calls } = reader({ graph: graph() });
    const report = runCheck({ packsDir: packsDir(), plugins: PLUGINS, readInstalled });
    expect(report.err).toEqual([]);
    expect(report.code).toBe(0);
    expect(calls).toEqual([[PLUGINS, 'o.p']]);
  });
});

describe('namedPlugins', () => {
  test('is undefined when no home is named', () => {
    expect(namedPlugins({})).toBeUndefined();
  });

  test("is the named home's plugins/, whether or not it exists", () => {
    const home = join(tmpdir(), 'check-factory-view-no-such-home');
    expect(namedPlugins({ ARCHON_HOME: home })).toBe(getPluginsPath(home));
  });

  test('takes the live home over ARCHON_HOME, and passes over an empty one', () => {
    const env = { ARCHON_FACTORY_LIVE_HOME: 'live', ARCHON_HOME: 'home' };
    expect(namedPlugins(env)).toBe(getPluginsPath('live'));
    expect(namedPlugins({ ...env, ARCHON_FACTORY_LIVE_HOME: '' })).toBe(getPluginsPath('home'));
  });
});

describe('packShape', () => {
  test('drops where the copies were read from, so two reads of one pack are equal', () => {
    const copy = (dir: string) => ({ source: 'installed' as const, key: 'o.p', dir });
    const read = (dir: string): PackGraph => ({
      ...graph(),
      loaded: [copy(dir)],
      otherCopies: [copy(`${dir}-other`)],
    });
    expect(Bun.deepEquals(read('/tmp/a'), read('/tmp/b'))).toBe(false);
    expect(packShape(read('/tmp/a'))).toEqual(packShape(read('/tmp/b')));
    expect(packShape(read('/tmp/a'))).toEqual({ ...read('/tmp/a'), loaded: [], otherCopies: [] });
  });
});

describe('installedGraph against the real CLI', () => {
  // Pins the `{ ok: false, error }` shape `cliError` reads: the reason is the CLI's own words.
  const PACK = 'Wirasm.archon-software-factory';
  const expectCliReason = (read: InstalledRead): void => {
    if (!('error' in read)) throw new Error('expected the CLI to find no pack');
    expect(read.error.startsWith('{')).toBe(false);
    expect(read.error).not.toMatch(/^exited \d+ with no output$/);
    expect(read.error).toContain(PACK);
  };

  test(
    "gives the CLI's reason for a home whose plugins/ lacks the pack, and for one with none",
    () => {
      const empty = tempDir('home');
      mkdirSync(getPluginsPath(empty));
      expectCliReason(installedGraph(getPluginsPath(empty), PACK));
      expectCliReason(installedGraph(getPluginsPath(tempDir('bare-home')), PACK));
    },
    { timeout: 120_000 }
  );
});

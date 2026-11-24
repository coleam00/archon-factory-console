import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPluginsPath } from '@archon/paths';
import { trackTempRoots } from '@archon/paths/test-utils';
import type { PackGraph } from '../packages/workflows/src/pack-graph';
import { FACTORY_VIEW_PROJECT_SUFFIX } from '../packages/workflows/src/schemas/factory-view';
import {
  type GraphRead,
  type GraphSource,
  installedGraph,
  namedPlugins,
  type PackPin,
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
  map: { cards: [], arrows: [] },
};

const VIEW_FILE = `o.p${FACTORY_VIEW_PROJECT_SUFFIX}`;
const PLUGINS = join('home', 'plugins');
const COMMIT = 'a'.repeat(40);
const PIN: PackPin = { repo: 'o/p', commit: COMMIT };

/** A packs directory holding the view and its pin. */
function packsDir(): string {
  const dir = tempDir('packs');
  writeFileSync(join(dir, VIEW_FILE), JSON.stringify(view));
  writeFileSync(join(dir, 'o.p.pack-pin.json'), JSON.stringify(PIN));
  return dir;
}

/** A source answering `installed` and `pinned`, recording which was asked, and with what. */
function source(reads: { installed?: GraphRead; pinned?: GraphRead }): {
  source: GraphSource;
  calls: string[][];
} {
  const calls: string[][] = [];
  const answer = (read: GraphRead | undefined, kind: string): GraphRead => {
    if (read === undefined) throw new Error(`the check should not read the ${kind} pack here`);
    return read;
  };
  return {
    calls,
    source: {
      installed: (plugins, packKey, pin) => {
        calls.push(['installed', plugins, packKey, pin.commit]);
        return answer(reads.installed, 'installed');
      },
      pinned: (packKey, pin) => {
        calls.push(['pinned', packKey, pin.commit]);
        return answer(reads.pinned, 'pinned');
      },
    },
  };
}

const atPin: GraphRead = { graph: graph(), commit: COMMIT };

describe('runCheck', () => {
  test('with no home named, reads the pack at its pinned commit and passes a clean view', () => {
    const { source: read, calls } = source({ pinned: atPin });
    const report = runCheck({ packsDir: packsDir(), plugins: undefined, source: read });
    expect(report.err).toEqual([]);
    expect(report.code).toBe(0);
    expect(calls).toEqual([['pinned', 'o.p', COMMIT]]);
  });

  test('fails without a pin, since nothing else says which pack to read', () => {
    const dir = packsDir();
    rmSync(join(dir, 'o.p.pack-pin.json'));
    const report = runCheck({ packsDir: dir, plugins: undefined, source: source({}).source });
    expect(report.code).toBe(1);
    expect(report.err.some(line => line.includes('[pin]'))).toBe(true);
  });

  test('fails on an overview file its schema refuses', () => {
    const dir = packsDir();
    writeFileSync(join(dir, 'o.p.factory-overview.json'), JSON.stringify({ version: 1 }));
    const report = runCheck({ packsDir: dir, plugins: undefined, ...source({ pinned: atPin }) });
    expect(report.code).toBe(1);
    expect(report.err.some(line => line.includes('o.p.factory-overview.json'))).toBe(true);
  });

  test('fails on a step name the pack lacks, naming it', () => {
    const dir = packsDir();
    writeFileSync(
      join(dir, VIEW_FILE),
      JSON.stringify({ ...view, steps: { plan: { nope: 'Does nothing' } } })
    );
    const report = runCheck({ packsDir: dir, plugins: undefined, ...source({ pinned: atPin }) });
    expect(report.code).toBe(1);
    expect(report.err.some(line => line.includes('"nope"'))).toBe(true);
  });

  test("fails with the reader's reason when the pinned commit cannot be read", () => {
    const report = runCheck({
      packsDir: packsDir(),
      plugins: undefined,
      ...source({ pinned: { error: 'stub reason' } }),
    });
    expect(report.code).toBe(1);
    expect(report.err.find(line => line.includes('[pin]'))).toContain('stub reason');
  });

  test("fails with the reader's reason when the named home cannot give the pack", () => {
    const report = runCheck({
      packsDir: packsDir(),
      plugins: PLUGINS,
      ...source({ installed: { error: 'stub reason' } }),
    });
    expect(report.code).toBe(1);
    expect(report.err.find(line => line.includes('[install]'))).toContain('stub reason');
  });

  test('fails when the pack installed in the named home is at another commit than the pin', () => {
    const report = runCheck({
      packsDir: packsDir(),
      plugins: PLUGINS,
      ...source({ installed: { graph: graph(), commit: 'b'.repeat(40) } }),
    });
    expect(report.code).toBe(1);
    expect(report.err.some(line => line.includes('[pin]') && line.includes('--pin o.p'))).toBe(
      true
    );
  });

  test('reads the pack from the named plugins, not the pin, and passes when it is at the pin', () => {
    const { source: read, calls } = source({ installed: atPin });
    const report = runCheck({ packsDir: packsDir(), plugins: PLUGINS, source: read });
    expect(report.err).toEqual([]);
    expect(report.code).toBe(0);
    expect(calls).toEqual([['installed', PLUGINS, 'o.p', COMMIT]]);
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

describe('installedGraph against the real CLI', () => {
  // Pins the `{ ok: false, error }` shape `cliError` reads: the reason is the CLI's own words.
  const PACK = 'Wirasm.archon-software-factory';
  const expectCliReason = (read: GraphRead): void => {
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
      expectCliReason(installedGraph(getPluginsPath(empty), PACK, PIN));
      expectCliReason(installedGraph(getPluginsPath(tempDir('bare-home')), PACK, PIN));
    },
    { timeout: 120_000 }
  );
});

import { describe, expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PluginDiscoveryError, type PluginDiscovery } from '@archon/forge/discovery';
import type { dispatchForge } from '@archon/forge/dispatch';
import type { ForgeRequest } from '@archon/forge/operations';
import { trackTempRoots } from '@archon/paths/test-utils';
import { changeMergeState, forgeHostDiscoveryOnce, prRefFromAudits } from './forge-host';

const URL10 = 'https://github.com/coleam00/archon-factory-console/pull/10';
const byUrl = (rows: unknown[]) => ({ kind: 'url' as const, url: URL10, audits: rows });
const repo = { host: 'github.com', path: 'coleam00/archon-factory-console' };
const prRecord = {
  repo,
  number: 10,
  schemaVersion: 1,
  url: URL10,
  head: 'archon/task-wirasm-archon-software-factory-deliver-c90ebf41',
  base: 'main',
  is_draft: false,
  state: 'open',
  head_repo: repo,
  head_revision: '387d6145b0d60ddb2c962876a9996a1819d0aff3',
  base_revision: 'bb2a8df9936022499b9ca13598d1079da8d2cb28',
  maintainer_can_modify: false,
} as const;

// Two audit rows a deliver run recorded (live factory, run c90ebf41), as stored.
const audits: unknown[] = [
  {
    integration: 'forge',
    operationId: 'ef5e0efa-c82c-43e4-a820-ff9e80e88179',
    operation: 'pr.reviews',
    target: { repo, number: 10 },
    plugin: { name: 'github', version: '1' },
    result: {
      operationId: 'ef5e0efa-c82c-43e4-a820-ff9e80e88179',
      ok: true,
      result: { op: 'pr.reviews', value: { ref: { repo, number: 10 }, items: [] } },
    },
    retries: 0,
    durationMs: 906,
  },
  {
    integration: 'forge',
    operationId: 'cbadda58-6130-432f-8e56-f403919c776e',
    operation: 'pr.ready',
    target: { repo, number: 10 },
    plugin: { name: 'github', version: '1' },
    result: {
      operationId: 'cbadda58-6130-432f-8e56-f403919c776e',
      ok: true,
      result: {
        op: 'pr.ready',
        value: {
          target: { repo, number: 10 },
          outcome: 'applied',
          changed: true,
          pr: prRecord,
        },
      },
    },
    retries: 0,
    durationMs: 2092,
  },
];

// The dispatch is replaced in these tests, so the plugins it would run through do not matter.
const none: PluginDiscovery = {
  plugins: [],
  unavailable: [],
  byHost: new Map(),
  hostConfig: new Map(),
  pluginTokenEnv: new Map(),
};
const noPlugins = async (): Promise<PluginDiscovery> => none;

type Dispatch = typeof dispatchForge;
type Dispatched = Awaited<ReturnType<Dispatch>>;

function answering(response: Dispatched['response']): {
  dispatch: Dispatch;
  asked: ForgeRequest[];
} {
  const asked: ForgeRequest[] = [];
  const dispatch: Dispatch = async request => {
    asked.push(request);
    return { response, plugin: null, audit: {} as Dispatched['audit'] };
  };
  return { dispatch, asked };
}

const viewed = (state: 'open' | 'closed' | 'merged', mergedAt: string | null) =>
  ({
    operationId: 'op',
    ok: true,
    result: {
      op: 'pr.view',
      value: {
        pr: { ...prRecord, state },
        title: 't',
        body: 'b',
        author: null,
        timestamps: {
          created_at: '2026-11-16T23:40:00Z',
          updated_at: '2026-11-17T01:00:00Z',
          merged_at: mergedAt,
          closed_at: mergedAt,
        },
      },
    },
  }) as unknown as Dispatched['response'];

/** The options a lookup takes, with `dispatch` standing in for the forge. */
const via = (dispatch: Dispatch, discovery = noPlugins) => ({ discovery, env: {}, dispatch });

describe('the merge state of a change', () => {
  test('finds the pull request in the audit rows that carry its record', () => {
    expect(prRefFromAudits(URL10, audits)).toEqual({ repo, number: 10 });
    expect(prRefFromAudits(`${URL10}1`, audits)).toBeNull();
    expect(prRefFromAudits(URL10, [{ not: 'an audit row' }])).toBeNull();
  });
  const noBranches = async (): Promise<string[]> => {
    throw new Error('branches are read only when no audit row names the change');
  };

  test.each([
    ['merged', '2026-11-17T01:00:00Z', true],
    ['open', null, false],
    ['closed', null, false],
  ] as const)('a %s pull request, asked by number with pr.view', async (state, at, merged) => {
    const { dispatch, asked } = answering(viewed(state, at));
    expect(await changeMergeState(byUrl(audits), noBranches, via(dispatch))).toEqual({
      url: URL10,
      merged,
      mergedAt: at,
      number: 10,
    });
    expect(asked).toEqual([
      {
        op: 'pr.view',
        operationId: expect.any(String),
        selector: { kind: 'number', ref: { repo, number: 10 } },
      },
    ]);
  });

  test('a forge failure or a throw is unknown, with why', async () => {
    const unknown = { url: null, merged: 'unknown' as const, mergedAt: null, number: null };
    expect(
      await changeMergeState(byUrl(audits), noBranches, via(answering(refused).dispatch))
    ).toEqual({ ...unknown, reason: expect.any(String) });
    const throwing: Dispatch = async () => {
      throw new Error('spawn failed');
    };
    expect(await changeMergeState(byUrl(audits), noBranches, via(throwing))).toEqual({
      ...unknown,
      reason: 'spawn failed',
    });
  });
});

const refused = {
  operationId: 'op',
  ok: false,
  error: { kind: 'no_credential', message: 'none configured' },
} as unknown as Dispatched['response'];

/**
 * A forge that resolves the change URL to `repo` and has a pull request on each head in
 * `heads` (null for none), answering per request.
 */
function forgeWith(heads: Record<string, Dispatched['response'] | null>): {
  dispatch: Dispatch;
  asked: ForgeRequest[];
} {
  const asked: ForgeRequest[] = [];
  const dispatch: Dispatch = async request => {
    asked.push(request);
    const response =
      request.op === 'resolve'
        ? ({
            operationId: 'op',
            ok: true,
            result: {
              op: 'resolve',
              value: {
                kind: 'resolved',
                forge: 'github',
                repo,
                plugin: { name: 'github', version: '1' },
                subject: { kind: 'pr', number: 10 },
              },
            },
          } as unknown as Dispatched['response'])
        : request.op === 'pr.view' && request.selector.kind === 'head'
          ? (heads[request.selector.head] ?? {
              operationId: 'op',
              ok: true,
              result: { op: 'pr.view', value: null },
            })
          : refused;
    return { response, plugin: null, audit: {} as Dispatched['audit'] };
  };
  return { dispatch, asked };
}

/** A pull request on another head, at another URL. */
const other = (() => {
  const view = viewed('merged', '2026-11-16T00:00:00Z') as unknown as {
    result: { value: { pr: Record<string, unknown> } };
  };
  view.result.value.pr = { ...view.result.value.pr, number: 9, url: `${URL10.slice(0, -2)}9` };
  return view as unknown as Dispatched['response'];
})();

/** Looks `lookup` up on `branches` (newest first) through `forge`. */
const walk = (
  lookup: Parameters<typeof changeMergeState>[0],
  branches: string[],
  forge: { dispatch: Dispatch }
) => changeMergeState(lookup, async () => branches, via(forge.dispatch));

describe('a change no audit row names: the pull request on a run branch', () => {
  const heads = (asked: ForgeRequest[]): string[] =>
    asked.flatMap(request =>
      request.op === 'pr.view' && request.selector.kind === 'head' ? [request.selector.head] : []
    );

  test('walks the branches newest first, past none and another URL, to the change', async () => {
    const forge = forgeWith({
      newest: null,
      middle: other,
      oldest: viewed('merged', '2026-11-17T01:00:00Z'),
    });
    const state = await walk(byUrl([]), ['newest', 'middle', 'oldest'], forge);
    expect(state).toEqual({
      url: URL10,
      merged: true,
      mergedAt: '2026-11-17T01:00:00Z',
      number: 10,
    });
    expect(forge.asked[0]).toMatchObject({ op: 'resolve', remote: URL10, web: true });
    expect(heads(forge.asked)).toEqual(['newest', 'middle', 'oldest']);
    expect(forge.asked[1]).toMatchObject({
      selector: { kind: 'head', repo, headRepo: repo, state: 'any' },
    });
  });

  test('a forge failure mid-walk is unknown, not not-found, and stops the walk', async () => {
    const forge = forgeWith({ newest: refused, oldest: viewed('merged', '2026-11-17T01:00:00Z') });
    const state = await walk(byUrl([]), ['newest', 'oldest'], forge);
    expect(state).toEqual({
      url: null,
      merged: 'unknown',
      mergedAt: null,
      number: null,
      reason: 'no_credential: none configured',
    });
    expect(heads(forge.asked)).toEqual(['newest']);
  });

  test.each([
    ['no branch', byUrl([]), []],
    ['no branch with the change', byUrl([]), ['only']],
    ['a project with no remote', { kind: 'branch' as const, remote: null }, ['only']],
  ])('%s is unknown, with why', async (_, lookup, branches) => {
    const forge = forgeWith({ only: other });
    expect(await walk(lookup, branches, forge)).toMatchObject({
      merged: 'unknown',
      number: null,
      reason: expect.any(String),
    });
    // Nothing to walk, or nowhere to walk it: the forge is never asked.
    if (branches.length === 0 || lookup.kind === 'branch') expect(forge.asked).toEqual([]);
  });
});

describe('a run that named no URL: the first pull request on a run branch', () => {
  test("resolves the project's remote, passes over a branch with none, takes the next whatever its URL", async () => {
    const REMOTE = 'https://github.com/coleam00/archon-factory-console.git';
    const forge = forgeWith({ newest: null, middle: other, oldest: viewed('merged', null) });
    expect(
      await walk({ kind: 'branch', remote: REMOTE }, ['newest', 'middle', 'oldest'], forge)
    ).toEqual({
      url: `${URL10.slice(0, -2)}9`,
      merged: true,
      mergedAt: '2026-11-16T00:00:00Z',
      number: 9,
    });
    expect(forge.asked[0]).toEqual({
      op: 'resolve',
      operationId: expect.any(String),
      remote: REMOTE,
    });
    expect(forge.asked.length).toBe(3);
  });
});

describe('forge plugins for the merge lookups', () => {
  const track = trackTempRoots();
  // A home with no config file: discovery reads nothing of the operator's.
  const home = async (): Promise<string> =>
    track(await mkdtemp(join(tmpdir(), 'archon-forge-host-')));
  // The audit rows name the pull request, so no branch is read.
  const noBranches = async (): Promise<string[]> => [];

  test('a failed discovery, or one that left a plugin unavailable, is discovered again', async () => {
    const answers: (() => PluginDiscovery)[] = [
      () => {
        throw new Error('handshake timed out');
      },
      () => ({ ...none, unavailable: [new PluginDiscoveryError('process_failed', 'gone')] }),
      () => none,
    ];
    let discovered = 0;
    const discovery = forgeHostDiscoveryOnce(await home(), {}, async () => {
      const answer = answers[discovered] ?? (() => none);
      discovered += 1;
      return answer();
    });
    const { dispatch } = answering(viewed('merged', '2026-11-17T01:00:00Z'));
    const lookup = () => changeMergeState(byUrl(audits), noBranches, via(dispatch, discovery));
    expect((await lookup()).merged).toBe('unknown');
    await lookup();
    await lookup();
    await lookup();
    expect(discovered).toBe(3);
  });
});

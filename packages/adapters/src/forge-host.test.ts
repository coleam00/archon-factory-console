import { describe, expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { dispatchForge } from '@archon/forge/dispatch';
import type { ForgeRequest } from '@archon/forge/operations';
import { trackTempRoots } from '@archon/paths/test-utils';
import { changeMergeState, prRefFromAudits } from './forge-host';

const URL10 = 'https://github.com/coleam00/archon-factory-console/pull/10';
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

describe('the merge state of a change', () => {
  const track = trackTempRoots();
  // A home with no config file and no plugins: discovery reads nothing of the operator's.
  const home = async (): Promise<string> =>
    track(await mkdtemp(join(tmpdir(), 'archon-forge-host-')));

  test('finds the pull request in the audit rows that carry its record', () => {
    expect(prRefFromAudits(URL10, audits)).toEqual({ repo, number: 10 });
    expect(prRefFromAudits(`${URL10}1`, audits)).toBeNull();
    expect(prRefFromAudits(URL10, [{ not: 'an audit row' }])).toBeNull();
  });

  test('a merged pull request is merged, with when; asked by number with pr.view', async () => {
    const { dispatch, asked } = answering(viewed('merged', '2026-11-17T01:00:00Z'));
    const state = await changeMergeState(URL10, audits, {
      archonHome: await home(),
      env: {},
      dispatch,
    });
    expect(state).toEqual({ merged: true, mergedAt: '2026-11-17T01:00:00Z' });
    expect(asked).toEqual([
      {
        op: 'pr.view',
        operationId: expect.any(String),
        selector: { kind: 'number', ref: { repo, number: 10 } },
      },
    ]);
  });

  test('an open pull request, or one closed without merging, is not merged', async () => {
    const archonHome = await home();
    for (const state of ['open', 'closed'] as const) {
      const { dispatch } = answering(viewed(state, null));
      expect(await changeMergeState(URL10, audits, { archonHome, env: {}, dispatch })).toEqual({
        merged: false,
        mergedAt: null,
      });
    }
  });

  test('a forge failure, a throw or no record of the change is unknown, with why', async () => {
    const failing = answering({
      operationId: 'op',
      ok: false,
      error: { kind: 'no_credential', message: 'none configured' },
    } as unknown as Dispatched['response']);
    const archonHome = await home();
    expect(
      await changeMergeState(URL10, audits, { archonHome, env: {}, dispatch: failing.dispatch })
    ).toEqual({ merged: 'unknown', mergedAt: null, reason: 'no_credential: none configured' });
    const throwing: Dispatch = async () => {
      throw new Error('spawn failed');
    };
    expect(
      await changeMergeState(URL10, audits, { archonHome, env: {}, dispatch: throwing })
    ).toEqual({ merged: 'unknown', mergedAt: null, reason: 'spawn failed' });
    const never = answering(viewed('merged', '2026-11-17T01:00:00Z'));
    expect(
      await changeMergeState(URL10, [], { archonHome, env: {}, dispatch: never.dispatch })
    ).toMatchObject({ merged: 'unknown' });
    expect(never.asked).toEqual([]);
  });
});

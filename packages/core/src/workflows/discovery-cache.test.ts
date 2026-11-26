import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trackTempRoots } from '@archon/paths/test-utils';
import { providerRegistry } from '@archon/providers';
import { createDiscoveryCache } from './discovery-cache';

const track = trackTempRoots();

const workflow = (name: string, description = name) => `name: ${name}
description: ${description}
nodes:
  - id: only
    bash: echo hi
`;

async function project(): Promise<string> {
  const root = track(await mkdtemp(join(tmpdir(), 'discovery-cache-')));
  await mkdir(join(root, '.archon', 'workflows'), { recursive: true });
  await writeFile(join(root, '.archon', 'workflows', 'one.yaml'), workflow('one'));
  return root;
}

const names = (result: Awaited<ReturnType<ReturnType<typeof createDiscoveryCache>>>) =>
  result.workflows.map(entry => entry.workflow.name);

describe('createDiscoveryCache', () => {
  test('answers a second read with the kept discovery while nothing changed', async () => {
    const root = await project();
    const discover = createDiscoveryCache(async () => ({}), providerRegistry);
    const first = await discover(root);
    expect(names(first)).toContain('one');
    expect(await discover(root)).toBe(first);
  });

  test('discovers again when a workflow file is edited, added or removed', async () => {
    const root = await project();
    const discover = createDiscoveryCache(async () => ({}), providerRegistry);
    const file = join(root, '.archon', 'workflows', 'one.yaml');
    const first = await discover(root);

    await writeFile(file, workflow('one', 'edited at the same size!'));
    // A filesystem with coarse times still sees the edit through the size or a later time.
    await utimes(file, new Date(), new Date(Date.now() + 5_000));
    const edited = await discover(root);
    expect(edited).not.toBe(first);
    expect(edited.workflows.find(e => e.workflow.name === 'one')?.workflow.description).toBe(
      'edited at the same size!'
    );

    await writeFile(join(root, '.archon', 'workflows', 'two.yaml'), workflow('two'));
    const added = await discover(root);
    expect(names(added)).toContain('two');

    await rm(join(root, '.archon', 'workflows', 'two.yaml'));
    expect(names(await discover(root))).not.toContain('two');
  });

  test('keeps nothing for a project that is itself a pack folder', async () => {
    const root = await project();
    await writeFile(join(root, 'archon-plugin.json'), '{"kind":"provider"}');
    const discover = createDiscoveryCache(async () => ({}), providerRegistry);
    const first = await discover(root);
    expect(await discover(root)).not.toBe(first);
  });

  test('keeps nothing from a discovery that rejected', async () => {
    const root = await project();
    // The stamp reads the config first, then discovery does: only discovery's read fails.
    let reads = 0;
    const discover = createDiscoveryCache(async () => {
      reads++;
      if (reads === 2) throw new Error('config unreadable');
      return {};
    }, providerRegistry);
    await expect(discover(root)).rejects.toThrow('config unreadable');
    expect(names(await discover(root))).toContain('one');
  });
});

import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trackTempRoots } from '@archon/paths/test-utils';
import { checkGroups, loadPackDocument, ungroupedStages } from './pack-document';

const track = trackTempRoots();

const MANIFEST = {
  schemaVersion: 1,
  kind: 'workflow-pack',
  name: 'flow',
  description: 'A pack.',
  entrypoints: { plan: 'plan/plan.yaml' },
};

/** A pack whose manifest names `document` (none when undefined), with `text` at `at`. */
async function pack(
  document: string | undefined,
  text?: string,
  at = 'docs/how.md'
): Promise<string> {
  const dir = track(await mkdtemp(join(tmpdir(), 'archon-pack-document-')));
  await writeFile(
    join(dir, 'archon-plugin.json'),
    JSON.stringify(document === undefined ? MANIFEST : { ...MANIFEST, document })
  );
  if (text !== undefined) {
    await mkdir(join(dir, 'docs'), { recursive: true });
    await writeFile(join(dir, at), text);
  }
  return dir;
}

describe("a pack's document", () => {
  test('the manifest names it; its frontmatter gives the groups, in order, and the text below is left alone', async () => {
    const dir = await pack(
      'docs/how.md',
      '---\ngroups:\n  - name: Make\n    blurb: Plan, then build\n    kind: build\n    stages: [plan, build]\n  - name: Check\n    stages: [check]\n---\n# How it works\n\n---\nnot frontmatter\n'
    );
    expect(await loadPackDocument(dir)).toEqual({
      document: 'docs/how.md',
      text: '# How it works\n\n---\nnot frontmatter\n',
      groups: [
        { name: 'Make', blurb: 'Plan, then build', kind: 'build', stages: ['plan', 'build'] },
        { name: 'Check', stages: ['check'] },
      ],
      problems: [],
      warnings: [],
    });
  });

  test('a manifest that names none falls back to how-it-works.md at the pack root', async () => {
    const dir = await pack(
      undefined,
      '---\ngroups:\n  - name: Make\n    stages: [plan]\n---\n# How\n',
      'how-it-works.md'
    );
    const read = await loadPackDocument(dir);
    expect([read.document, read.groups, read.problems]).toEqual([
      'how-it-works.md',
      [{ name: 'Make', stages: ['plan'] }],
      [],
    ]);
  });

  test('a pack with no named document and no how-it-works.md, or a document without frontmatter, declares no groups', async () => {
    expect(await loadPackDocument(await pack(undefined))).toEqual({
      document: null,
      text: '',
      groups: [],
      problems: [],
      warnings: [],
    });
    expect((await loadPackDocument(await pack('docs/how.md', '# How it works\n'))).groups).toEqual(
      []
    );
  });

  test('a named document that is missing or does not read is a problem, with no groups', async () => {
    const missing = await loadPackDocument(await pack('docs/how.md'));
    expect([missing.groups, missing.problems.length]).toEqual([[], 1]);
    const malformed = await loadPackDocument(
      await pack('docs/how.md', '---\ngroups:\n  - name: Make\n---\n')
    );
    expect([malformed.groups, malformed.problems.length]).toEqual([[], 1]);
  });

  test('a key the frontmatter or a group has that this Archon does not read is a warning, and the groups still read', async () => {
    const read = await loadPackDocument(
      await pack(
        'docs/how.md',
        '---\ncolour: blue\ngroups:\n  - name: Make\n    stages: [plan]\n    colour: red\n---\n'
      )
    );
    expect(read.groups).toEqual([{ name: 'Make', stages: ['plan'] }]);
    expect(read.problems).toEqual([]);
    expect(read.warnings).toEqual([
      "unknown key 'colour' is ignored",
      "unknown key 'groups[0].colour' is ignored",
    ]);
  });
});

describe('checkGroups', () => {
  const stages = ['plan', 'build', 'check'];

  test('a stale or repeated stage drops only itself, and a group left with none goes', () => {
    expect(
      checkGroups(
        [
          { name: 'Make', stages: ['plan', 'built', 'build'] },
          { name: 'Check', kind: 'check', stages: ['check', 'plan'] },
          { name: 'Gone', stages: ['nope'] },
        ],
        stages
      )
    ).toEqual({
      groups: [
        { name: 'Make', stages: ['plan', 'build'] },
        { name: 'Check', kind: 'check', stages: ['check'] },
      ],
      problems: [
        "group 'Make' names 'built', which is not a stage of the pack's flow",
        "stage 'plan' is in more than one group",
        "group 'Gone' names 'nope', which is not a stage of the pack's flow",
      ],
    });
  });

  test('an in-flow stage in no group is a problem once the document declares groups', () => {
    expect(ungroupedStages([{ name: 'Make', stages: ['plan', 'build'] }], stages)).toEqual([
      "stage 'check' is in no group",
    ]);
    expect(ungroupedStages([], stages)).toEqual([]);
  });
});

import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { providerRegistry } from '@archon/providers';
import { trackTempRoots } from '@archon/paths/test-utils';
import * as bundleInventory from './defaults/bundle-inventory';
import { conditionClauses, factoryWorkflowSteps } from './factory-steps';
import { DEFAULT_WORKFLOW_SOURCE_CONFIG, liveSourceRoots } from './workflow-source';
import { discoverWorkflows } from './workflow-discovery';

const track = trackTempRoots();
const indexSpy = spyOn(bundleInventory, 'readBundleIndex').mockResolvedValue([]);
afterAll(() => {
  indexSpy.mockRestore();
});

/** A folder pack `kit` in a project: `ship` includes three small workflows, one inside a loop. */
const PACK: Record<string, string> = {
  'ship/ship.yaml': `name: ship
description: Ships.
nodes:
  - id: start
    include: setup
  # Authored at the top with the include separator in it: not an include.
  - id: odd__id
    depends_on: [start]
    bash: echo top
  - id: rounds
    depends_on: [odd__id]
    loop_group:
      max_iterations: 3
      until_bash: "true"
      nodes:
        - id: fix
          command: fix
          model: ['@builder', large]
          when: "$odd__id.output == 'go'"
        - id: check
          include: check
          depends_on: [fix]
          trigger_rule: all_done
        - id: verdict
          include: verdict
          depends_on: [check]
  - id: result
    depends_on: [rounds]
    runtime: bun
    script: console.log('{}')
`,
  'ship/commands/fix.md': '# Fix what came back\n\nRead the findings.\n',
  'setup/setup.yaml': `name: setup
description: Sets up.
nodes:
  - id: s
    prompt: Set up.
`,
  'check/check.yaml': `name: check
description: Checks.
nodes:
  - id: look
    command: look
`,
  'check/commands/look.md': '# Look at it\n',
  'verdict/verdict.yaml': `name: verdict
description: Decides.
nodes:
  - id: decide
    bash: echo approve
`,
};

async function shipSteps(): Promise<Awaited<ReturnType<typeof factoryWorkflowSteps>>> {
  const project = track(await mkdtemp(join(tmpdir(), 'archon-factory-steps-')));
  for (const [path, content] of Object.entries(PACK)) {
    const file = join(project, '.archon', 'workflows', 'kit', ...path.split('/'));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  const { workflows, errors } = await discoverWorkflows(project, {
    providers: providerRegistry,
    loadDefaults: false,
  });
  expect(errors).toEqual([]);
  const ship = workflows.find(entry => entry.workflow.name === 'ship');
  if (ship === undefined) throw new Error('ship was not discovered');
  return factoryWorkflowSteps('ship', ship.workflow, {
    cwd: project,
    deps: { loadConfig: async () => ({}) as never },
    roots: liveSourceRoots(project, DEFAULT_WORKFLOW_SOURCE_CONFIG),
  });
}

describe('factoryWorkflowSteps', () => {
  test('a loop group frames its body, and each include is a group named for its workflow', async () => {
    const ship = await shipSteps();
    expect(ship.groups.map(g => [g.id, g.kind, g.parent, g.label, g.maxRounds])).toEqual([
      ['start', 'include', null, 'setup', null],
      ['rounds', 'loop', null, 'rounds', 3],
      ['rounds.check', 'include', 'rounds', 'check', null],
      ['rounds.verdict', 'include', 'rounds', 'verdict', null],
    ]);
    expect(ship.groups.find(g => g.id === 'rounds')?.dependsOn).toEqual(['odd__id']);
    expect(ship.steps.map(s => [s.key, s.label, s.group, s.kind, s.includedFrom])).toEqual([
      ['start__s', 's', 'start', 'agent', 'setup'],
      ['odd__id', 'odd__id', null, 'bash', null],
      ['rounds.fix', 'fix', 'rounds', 'agent', null],
      ['rounds.check__look', 'look', 'rounds.check', 'agent', 'check'],
      ['rounds.verdict__decide', 'decide', 'rounds.verdict', 'bash', 'verdict'],
      ['result', 'result', null, 'script', null],
    ]);
  });

  test('dependencies inside a loop are keyed as run events name the steps', async () => {
    const steps = new Map((await shipSteps()).steps.map(s => [s.key, s]));
    expect(steps.get('rounds.check__look')?.dependsOn).toEqual(['rounds.fix']);
    expect(steps.get('rounds.verdict__decide')?.dependsOn).toEqual(['rounds.check__look']);
    expect(steps.get('result')?.dependsOn).toEqual(['rounds']);
  });

  test("a command step carries its model, condition, command file's prompt and authored YAML", async () => {
    const fix = (await shipSteps()).steps.find(s => s.key === 'rounds.fix');
    expect(fix?.model).toEqual(['@builder', 'large']);
    expect(fix?.when).toBe("$odd__id.output == 'go'");
    // A top-level step a loop body's condition reads is keyed as run events name it.
    expect(fix?.whenClauses).toEqual([
      [{ reads: { kind: 'step', key: 'odd__id' }, operator: '==', value: 'go' }],
    ]);
    expect(fix?.command).toBe('fix');
    expect(fix?.prompt).toBe(PACK['ship/commands/fix.md']);
    expect(fix?.promptError).toBeNull();
    expect(fix?.yaml).toBe(
      "id: fix\ncommand: fix\nmodel: ['@builder', large]\nwhen: \"$odd__id.output == 'go'\""
    );
  });

  test("an included step's YAML and command come from the workflow that declared it", async () => {
    const look = (await shipSteps()).steps.find(s => s.key === 'rounds.check__look');
    expect(look?.yaml).toBe('id: look\ncommand: look');
    expect(look?.command).toBe('look');
    expect(look?.prompt).toContain('# Look at it');
  });

  test('a bash or script step runs no prompt, and shows what it runs in its YAML', async () => {
    const steps = new Map((await shipSteps()).steps.map(s => [s.key, s]));
    expect(steps.get('odd__id')?.prompt).toBeNull();
    expect(steps.get('odd__id')?.yaml).toBe('id: odd__id\ndepends_on: [start]\nbash: echo top');
    expect(steps.get('result')?.prompt).toBeNull();
    expect(steps.get('result')?.yaml).toContain("script: console.log('{}')");
  });
});

describe('conditionClauses', () => {
  const key = (nodeId: string): string => `rounds.${nodeId}`;

  test('keys the step a comparison reads, with its operator and value, and drops the field', () => {
    expect(conditionClauses("$LOOP_PREV.verdict__verdict.output.outcome == 'return'", key)).toEqual(
      [
        [
          {
            reads: { kind: 'step', key: 'rounds.verdict__verdict' },
            operator: '==',
            value: 'return',
          },
        ],
      ]
    );
  });

  test('keeps and, or, inputs, other operators and an empty value', () => {
    const step = (name: string) => ({ kind: 'step' as const, key: `rounds.${name}` });
    expect(
      conditionClauses("$a.output != '' && $INPUTS.mode == 'fast' || $b.output.score >= 80", key)
    ).toEqual([
      [
        { reads: step('a'), operator: '!=', value: '' },
        { reads: { kind: 'input', name: 'mode' }, operator: '==', value: 'fast' },
      ],
      [{ reads: step('b'), operator: '>=', value: '80' }],
    ]);
  });

  test('an expression the engine does not parse has no clauses', () => {
    expect(conditionClauses('not a condition', key)).toBeNull();
  });
});

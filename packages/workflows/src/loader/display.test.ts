// @archon-test-isolated
import {
  discoverFiles,
  parseError,
  parseWorkflow,
  parseWorkflowYaml,
  useTempWorkflowRoot,
} from './test-utils';
import { describe, it, expect } from 'bun:test';
import { buildPackGraph } from '../pack-graph';

/** A stage whose `end` node returns one of `values` as its outcome, with `extra` YAML after it. */
const stage = (extra: string, values = '[go, stop]') => `name: decide
description: decides
returns: { node: end, outcome: outcome }
nodes:
  - id: end
    bash: echo '{"outcome":"go"}'
    output_format:
      type: object
      properties: { outcome: { type: string, enum: ${values} } }
      required: [outcome]
${extra}`;

describe('display: on a workflow, a node and an outcome', () => {
  it('parses the words where they are authored', () => {
    const { workflow } = parseWorkflowYaml(
      stage(`display:
  label: Decide
  short: Makes the call
  blurb: Decides whether the item goes on.
  outcomes:
    go: { label: Went on, story: It went on }
    stop:
      story: { withChange: It stopped with a change, withoutChange: It stopped }
`).replace('    bash:', '    display: { label: Ends it, text: Hands the decision on }\n    bash:')
    );
    expect(workflow.display).toEqual({
      label: 'Decide',
      short: 'Makes the call',
      blurb: 'Decides whether the item goes on.',
      outcomes: {
        go: { label: 'Went on', story: 'It went on' },
        stop: { story: { withChange: 'It stopped with a change', withoutChange: 'It stopped' } },
      },
    });
    expect(workflow.nodes[0]).toMatchObject({
      display: { label: 'Ends it', text: 'Hands the decision on' },
    });
  });

  it('leaves a workflow without display: as it was', () => {
    const { workflow, warnings } = parseWorkflowYaml(stage(''));
    expect('display' in workflow).toBe(false);
    expect('display' in (workflow.nodes[0] ?? {})).toBe(false);
    expect(warnings).toEqual([]);
  });

  it('refuses an unknown key at every level as a load error, not a warning', () => {
    expect(parseError(stage('display: { label: Decide, lable: Decide }\n'))).toContain(
      "Invalid 'display'"
    );
    expect(
      parseError(stage('display: { label: Decide, outcomes: { go: { label: Go, tale: x } } }\n'))
    ).toContain("Invalid 'display'");
    expect(
      parseError(
        stage('').replace('    bash:', '    display: { label: End, lable: End }\n    bash:')
      )
    ).toContain('display');
    // A node display without its label is as wrong as a misspelt key.
    expect(
      parseWorkflow(stage('').replace('    bash:', '    display: {}\n    bash:'), 'x.yaml').workflow
    ).toBeNull();
  });

  it('refuses words for an outcome the workflow cannot end with', () => {
    expect(
      parseError(stage('display: { label: D, outcomes: { gone: { label: Gone } } }\n'))
    ).toContain("display.outcomes names 'gone'");
    expect(
      parseError(`name: plain
description: no outcome
nodes:
  - id: end
    bash: 'true'
display: { label: Plain, outcomes: { go: { label: Go } } }
`)
    ).toContain('display.outcomes but no returns.outcome');
  });

  it('refuses display: on an include node, whose label belongs on the included node', () => {
    expect(
      parseError(`name: outer
description: includes
nodes:
  - id: blk
    include: decide
    display: { label: Block }
`)
    ).toContain(
      "is not supported on an include node: it expands into the included workflow's nodes"
    );
  });
});

describe('the pack graph serves display:', () => {
  const root = useTempWorkflowRoot();

  it('serves stage, outcome and node words, an included node under its expanded id', async () => {
    const result = await discoverFiles(root(), {
      'check.yaml': `name: check
description: an included check
returns: { node: verdict, outcome: outcome }
display: { label: Check alone }
nodes:
  - id: verdict
    display: { label: Verdict }
    bash: echo '{"outcome":"approve"}'
    output_format:
      type: object
      properties: { outcome: { type: string, enum: [approve, return] } }
      required: [outcome]
`,
      'stage.yaml': `name: stage
description: includes the check at the top and in a loop body
returns: { node: final, outcome: outcome }
display:
  label: Checks
  short: Reads the change
  outcomes:
    return: { label: Sent back, story: The checks sent it back }
nodes:
  - id: base
    display: { label: Reads the base }
    bash: 'true'
  - id: rounds
    depends_on: [base]
    loop_group:
      until_bash: 'true'
      max_iterations: 2
      nodes:
        - id: verdict
          include: check
  - id: final
    include: check
    depends_on: [rounds]
`,
    });
    expect(result.errors).toEqual([]);
    const staged = result.workflows.map(w => w.workflow).filter(w => w.name === 'stage');
    const graph = buildPackGraph({
      packKey: 'chain',
      stages: staged,
      workflows: result.workflows.map(w => w.workflow),
      declared: undefined,
      installed: [],
      discoveryErrors: [],
    });
    const [only] = graph.stages;
    expect(only?.display).toEqual({ label: 'Checks', short: 'Reads the change' });
    expect(only?.outcome?.values.map(v => [v.value, v.display])).toEqual([
      ['approve', undefined],
      ['return', { label: 'Sent back', story: 'The checks sent it back' }],
    ]);
    const labels = Object.fromEntries(only?.nodes.map(n => [n.id, n.display?.label]) ?? []);
    expect(labels).toEqual({
      base: 'Reads the base',
      rounds: undefined,
      'rounds.verdict__verdict': 'Verdict',
      final__verdict: 'Verdict',
    });
    // Absent, never null, so a pack without display: serves the same JSON as before.
    expect(only?.nodes.find(n => n.id === 'rounds')).not.toHaveProperty('display');
  });
});

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FactoryItemDetail } from '../../skills/factory';
import { itemDetail, PROJECT, shippedView } from '../item-detail.test-fixtures';
import { asksSettledRunId } from './answered';
import { firstSentence, itemStory, type StagePanel, type StoryPanel } from './item-story';
import { buildTimeline } from './timeline';

const NOW = Date.parse('2026-11-22T09:00:00Z');

/** The pack graph snapshot committed beside the view file: every outcome each workflow declares. */
const graph = JSON.parse(
  readFileSync(
    join(
      import.meta.dir,
      '../../../../../../../.archon/packs/Wirasm.archon-software-factory.pack-graph.json'
    ),
    'utf8'
  )
) as { stages: { name: string; outcome: { values: { value: string }[] } | null }[] };

const story = (detail: FactoryItemDetail): StoryPanel[] =>
  itemStory(shippedView, PROJECT, detail, buildTimeline(shippedView, detail), NOW);

const stagePanels = (detail: FactoryItemDetail): StagePanel[] =>
  story(detail).filter((panel): panel is StagePanel => panel.kind === 'stage');

type ItemRun = FactoryItemDetail['item']['runs'][number];

/** Item 86 with one run of `workflow` in place of its runs, ended so. */
function oneRun(workflow: string, run: Partial<ItemRun>): FactoryItemDetail {
  const base = structuredClone(itemDetail('86'));
  const [template] = base.item.runs;
  const [facts] = base.runs;
  if (template === undefined || facts === undefined || base.item.progress === null)
    throw new Error('item 86 has runs');
  base.item.runs = [
    {
      ...template,
      id: 'r1',
      workflow: `${shippedView.pack}:${workflow}`,
      status: 'completed',
      ...run,
    },
  ];
  base.runs = [{ ...facts, runId: 'r1', workflow, steps: [], shadows: [], said: null }];
  base.item.progress = { ...base.item.progress, parked: null, runs: [] };
  return base;
}

/** The view's own sentence for a completed outcome: exact, else `workflow:*`. */
const told = (workflow: string, outcome: string | null): string | undefined =>
  (outcome === null ? undefined : shippedView.story?.outcomes[`${workflow}:${outcome}`]) ??
  shippedView.story?.outcomes[`${workflow}:*`];

/** Each workflow the page tells, by its name in the view, with the outcomes the pack declares. */
const WORKFLOWS = [
  ...new Set([
    ...shippedView.stages.flatMap(stage => stage.workflows),
    shippedView.discoveries?.workflow ?? '',
  ]),
].map(workflow => {
  const stage = graph.stages.find(entry => entry.name === `${shippedView.pack}:${workflow}`);
  return { workflow, outcomes: stage?.outcome?.values.map(entry => entry.value) ?? [] };
});

describe('one plain sentence per outcome', () => {
  test('the page tells every workflow the item page meets', () => {
    expect(WORKFLOWS.map(entry => entry.workflow).sort()).toEqual(
      [
        'deliver',
        'discoveries',
        'land',
        'landed',
        'landgate',
        'order',
        'plan',
        'split',
        'stage-build',
        'stage-check',
        'stage-host',
        'triage',
      ].sort()
    );
  });

  for (const { workflow, outcomes } of WORKFLOWS)
    for (const outcome of [...outcomes, null])
      test(`${workflow}:${outcome ?? '(none)'} reads the view's sentence`, () => {
        const sentence = told(workflow, outcome);
        // A declared outcome always has one: `check:factory-view` fails otherwise.
        if (outcome !== null) expect(sentence).toBeDefined();
        if (sentence === undefined) return;
        const [panel] = story(oneRun(workflow, { outcome }));
        expect(panel?.kind === 'merged' ? null : panel?.sentence).toEqual({
          text: sentence,
          mono: null,
        });
      });

  test('an outcome the view does not tell falls back to a neutral sentence', () => {
    const [panel] = story(oneRun('plan', { outcome: 'pondered' }));
    expect(panel?.kind === 'stage' ? panel.sentence : null).toEqual({
      text: 'Plan finished:',
      mono: 'pondered',
    });
    const { story: _story, ...untold } = shippedView;
    const detail = oneRun('plan', { outcome: 'planned' });
    const [plain] = itemStory(untold, PROJECT, detail, buildTimeline(untold, detail), NOW);
    expect(plain?.kind === 'stage' ? plain.sentence.text : null).toBe(
      'Plan finished: sent to Build'
    );
  });

  test('a run not finished says what it is doing, in its stage name', () => {
    const sentence = (run: Partial<ItemRun>) => {
      const [panel] = story(oneRun('plan', run));
      return panel?.kind === 'stage' ? panel.sentence.text : null;
    };
    expect(sentence({ status: 'running', outcome: null })).toBe('Plan is working on it now');
    expect(sentence({ status: 'failed', outcome: null })).toBe('Plan failed');
    const failedAt = oneRun('plan', { status: 'failed', outcome: null });
    failedAt.item.progress?.runs.push({ runId: 'r1', workflow: 'plan', failedStep: 'plan' });
    const [failed] = story(failedAt);
    expect(failed?.kind === 'stage' ? failed.sentence.text : null).toBe(
      'Plan failed at Writes the plan'
    );
    expect(sentence({ status: 'cancelled', outcome: null })).toBe('Plan was stopped');
    expect(sentence({ status: 'pending', outcome: null })).toBe('Plan is waiting to start');
  });
});

describe("the console's clauses", () => {
  test('the PR, once: on the panel of the run that named it first', () => {
    const named = stagePanels(itemDetail('125')).filter(panel => panel.pr !== null);
    expect(named.map(panel => [panel.stage.id, panel.pr?.label])).toEqual([['build', 'PR #128']]);
  });

  test('why the checks sent it back: the round summary, one sentence, the rest behind More', () => {
    const detail = structuredClone(itemDetail('125'));
    // Cut the story after the third round, which sent it back.
    const third = detail.item.runs.findIndex(run => run.id.startsWith('bb11ef33'));
    detail.item.runs = detail.item.runs.slice(0, third + 1);
    const checks = stagePanels(detail).find(panel => panel.stage.id === 'checks');
    expect(checks?.sentence.text).toBe('Checks sent it back twice');
    expect(checks?.reason?.full).toStartWith('Return:');
    expect(firstSentence('Return. The approach holds, but one finding stands. More here.')).toBe(
      'Return. The approach holds, but one finding stands.'
    );
    expect(checks?.reason?.short).toBe(firstSentence(checks?.reason?.full ?? ''));
    expect((checks?.reason?.short.length ?? 0) < (checks?.reason?.full.length ?? 0)).toBe(true);
  });

  test('a last round that replanned does not read "asked you": the run tells it', () => {
    const detail = structuredClone(itemDetail('125'));
    const last = detail.item.runs.find(run => run.id.startsWith('02e5f706'));
    const facts = detail.runs.find(run => run.runId.startsWith('02e5f706'));
    const round = facts?.rounds?.rounds[0];
    if (last === undefined || round === undefined) throw new Error('125 has a fourth round');
    detail.item.runs = detail.item.runs.slice(0, detail.item.runs.indexOf(last) + 1);
    detail.item.answers = [];
    last.outcome = 'replan';
    round.outcome = 'replan';
    round.steps = round.steps.map(step => ({
      ...step,
      outcome: step.outcome === 'ask' ? 'replan' : step.outcome,
    }));
    const checks = stagePanels(detail).find(panel => panel.stage.id === 'checks');
    expect(checks?.sentence.text).toBe('The checks sent it back to planning');
  });

  test('a send-back from CI: the run said why', () => {
    const detail = structuredClone(itemDetail('125'));
    const host = detail.item.runs.findIndex(run => run.id.startsWith('52f46ea3'));
    detail.item.runs = detail.item.runs.slice(0, host + 1);
    const ci = stagePanels(detail).find(panel => panel.stage.id === 'host');
    expect(ci?.sentence.text).toBe('CI or a review sent it back');
    expect(ci?.reason?.full).toBe(
      detail.runs.find(run => run.runId.startsWith('52f46ea3'))?.said ?? undefined
    );
  });

  test('an answered ask: what you chose, who, and what it started', () => {
    const build = stagePanels(itemDetail('113')).find(panel => panel.stage.id === 'build');
    expect(build?.answered.map(ask => [ask.chosen, ask.optionId, ask.by, ask.started])).toEqual([
      ['Send back', 'send-back', 'cole-owner', 'Build started again'],
    ]);
    // The second delivery ended the panel without asking: no "you said" on its sentence.
    expect(build?.youSaid).toBeNull();
    const replanned = stagePanels(itemDetail('115')).find(panel => panel.stage.id === 'build');
    expect(replanned?.sentence.text).toBe('Delivery asked you');
    expect(replanned?.youSaid).toBe('Replan');
    expect(replanned?.answered[0]?.started).toBe('Plan started again');
  });

  test('an answer that started nothing says so', () => {
    const detail = structuredClone(itemDetail('113'));
    // Drop the run the answer started.
    detail.item.runs = detail.item.runs.filter(run => asksSettledRunId(run.cause) === null);
    const build = stagePanels(detail).find(panel => panel.stage.id === 'build');
    expect(build?.answered[0]?.started).toBe('Nothing started');
  });
});

describe("a panel's details", () => {
  test("a run that works several stages: each panel its own stretch, the cost the whole run's", () => {
    const detail = itemDetail('111');
    const deliver = detail.item.runs.find(run => run.workflow.endsWith(':deliver'));
    const panels = stagePanels(detail).filter(panel =>
      ['build', 'checks', 'host'].includes(panel.stage.id)
    );
    expect(panels.map(panel => panel.stage.id)).toEqual(['build', 'checks', 'host']);
    // Back to back, from the run's start to its end.
    expect(panels[0]?.details.start).toBe(deliver?.startedAt ?? '');
    expect(panels[0]?.details.end).toBe(panels[1]?.details.start);
    expect(panels[1]?.details.end).toBe(panels[2]?.details.start);
    expect(panels[2]?.details.end).toBe(deliver?.completedAt ?? null);
    expect(panels.every(panel => panel.details.wholeRun)).toBe(true);
    // A run of one stage is all its panel's.
    expect(stagePanels(detail)[0]?.details.wholeRun).toBe(false);
  });
});

describe('the last panels', () => {
  test('a change a person merged: a Merged panel that does not say the factory merged it', () => {
    const last = story(itemDetail('111')).at(-1);
    expect(last).toEqual({
      kind: 'merged',
      key: 'merged',
      stage: shippedView.stages.find(stage => stage.id === 'landed'),
      at: itemDetail('111').item.progress?.change?.mergedAt ?? null,
    });
  });

  test('a change the factory merged: its land run says so; the Merged stage panel has the time', () => {
    const panels = stagePanels(itemDetail('125'));
    expect(panels.find(panel => panel.stage.id === 'ready')?.sentence.text).toBe(
      'The factory merged it'
    );
    expect(panels.at(-1)?.merged).toBe(itemDetail('125').item.progress?.change?.mergedAt ?? null);
  });

  test('the discoveries drain is told on its own quiet panel, in start order', () => {
    const kinds = story(itemDetail('111')).map(panel =>
      panel.kind === 'stage' ? panel.stage.id : panel.kind
    );
    expect(kinds.slice(-3)).toEqual(['drain', 'ready', 'merged']);
  });
});

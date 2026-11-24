/**
 * Whether a factory view's names are the pack's (`bun run check:factory-view`). The view is
 * presentation only: it gives the pack graph's workflows, steps, outcomes and options words, a
 * stage and a position. So the check FAILS on a name the view uses that the graph lacks, and
 * WARNS on what the graph has that the view leaves out, which is how a new stage gets noticed.
 *
 * A workflow the view declares `retired` is not required of the pack, and nothing of it is
 * compared: its old runs still place and read, so the view keeps wording them.
 */
import { type PackGraph, packWorkflowName } from '../packages/workflows/src/pack-graph';
import {
  changeSources,
  type FactoryView,
  isLoopRounds,
  roundsSources,
} from '../packages/workflows/src/schemas/factory-view';
import {
  mapArrows,
  type RunNames,
} from '../packages/web/src/experiments/console/factory/lib/graph-structure';

export interface NameFinding {
  /** Where in the view to act, as a zod issue path. */
  path: (string | number)[];
  message: string;
}

export interface NameCheck {
  /** Names the graph lacks: the check exits 1. */
  fails: NameFinding[];
  /** What the graph has that the view leaves out: printed, the check still passes. */
  warns: NameFinding[];
}

type ViewPath = NameFinding['path'];
type GraphStage = PackGraph['stages'][number];

const isRetired = (view: FactoryView, workflow: string): boolean =>
  view.retired?.includes(workflow) === true;

const splitKey = (key: string): { workflow: string; name: string } => {
  const at = key.lastIndexOf(':');
  return { workflow: key.slice(0, at), name: key.slice(at + 1) };
};

/** The view's workflows to their names in the graph; a workflow the graph lacks is left out. */
export function viewRunNames(view: FactoryView, graph: PackGraph): Record<string, string> {
  const names = graph.stages.map(stage => stage.name);
  const workflows = [
    ...view.stages.flatMap(stage => stage.workflows),
    ...(view.discoveries === undefined ? [] : [view.discoveries.workflow]),
  ];
  const out: Record<string, string> = {};
  for (const workflow of workflows) {
    const name = packWorkflowName(names, workflow);
    if (name !== undefined) out[workflow] = name;
  }
  return out;
}

/** Every place the view names a workflow, with the step, outcome or option it names there. */
interface Named {
  path: ViewPath;
  workflow: string;
  step?: string;
  /** A loop drill-down or loop-form rounds source, which must name a loop group. */
  loop?: boolean;
  outcome?: string;
  option?: string;
  /** It reads the run's result, so the workflow must return one. */
  result?: boolean;
}

const keyed = (
  field: string,
  record: Record<string, unknown> | undefined,
  as: 'outcome' | 'option'
): Named[] =>
  Object.keys(record ?? {}).map(key => {
    const { workflow, name } = splitKey(key);
    return { path: [field, key], workflow, [as]: name };
  });

const byWorkflowStep = (
  path: string[],
  record: Record<string, Record<string, unknown>> | undefined
): Named[] =>
  Object.entries(record ?? {}).flatMap(([workflow, steps]) => [
    { path: [...path, workflow], workflow },
    ...Object.keys(steps).map(step => ({ path: [...path, workflow, step], workflow, step })),
  ]);

/** Drill-down cards and loops, each step they cover. */
function coverNames(view: FactoryView): Named[] {
  return view.stages.flatMap((stage, s) => {
    const drilldown = stage.drilldown;
    if (drilldown === undefined) return [];
    const at = ['stages', s, 'drilldown'];
    const cards = drilldown.phases.flatMap((phase, p) =>
      phase.cards.flatMap((card, c) =>
        card.covers.flatMap((cover, k) =>
          cover.steps.map(
            (step, m): Named => ({
              path: [...at, 'phases', p, 'cards', c, 'covers', k, 'steps', m],
              workflow: cover.workflow,
              step,
            })
          )
        )
      )
    );
    const loop = drilldown.loop;
    return loop === undefined
      ? cards
      : [
          ...cards,
          { path: [...at, 'loop', 'step'], workflow: loop.workflow, step: loop.step, loop: true },
        ];
  });
}

function namesOf(view: FactoryView): Named[] {
  const at = (field: 'change' | 'rounds', index: number, leaf: string): ViewPath =>
    Array.isArray(view[field]) ? [field, index, leaf] : [field, leaf];
  const points = (field: 'returns' | 'approves'): Named[] =>
    (view[field] ?? []).map((point, i) => ({
      path: [field, i, 'node'],
      workflow: point.workflow,
      step: point.node,
      outcome: undefined,
    }));
  return [
    ...view.stages.flatMap((stage, s) =>
      stage.workflows.map((workflow, w) => ({ path: ['stages', s, 'workflows', w], workflow }))
    ),
    ...keyed('placement', view.placement, 'outcome'),
    ...keyed('endings', view.endings, 'outcome'),
    ...keyed('parked', view.parked, 'outcome'),
    ...keyed('awaits', view.awaits, 'outcome'),
    ...keyed('answers', view.answers, 'option'),
    ...Object.keys(view.story?.outcomes ?? {}).map(key => {
      const { workflow, name } = splitKey(key);
      return { path: ['story', 'outcomes', key], workflow, outcome: name };
    }),
    ...byWorkflowStep(['steps'], view.steps),
    ...byWorkflowStep(['story', 'steps'], view.story?.steps),
    ...byWorkflowStep(['verdicts'], view.verdicts),
    ...points('returns'),
    ...points('approves'),
    ...roundsSources(view).map((source, i) =>
      isLoopRounds(source)
        ? {
            path: at('rounds', i, 'loop'),
            workflow: source.workflow,
            step: source.loop,
            loop: true,
          }
        : { path: at('rounds', i, 'workflow'), workflow: source.workflow, result: true }
    ),
    ...changeSources(view).map((source, i) => ({
      path: at('change', i, 'workflow'),
      workflow: source.workflow,
      result: true,
    })),
    ...(view.partOf === undefined
      ? []
      : [
          {
            path: ['partOf', 'outcome'],
            workflow: view.partOf.workflow,
            outcome: view.partOf.outcome,
          },
        ]),
    ...(view.discoveries === undefined
      ? []
      : [{ path: ['discoveries', 'workflow'], workflow: view.discoveries.workflow }]),
    ...coverNames(view),
  ];
}

/** The outcomes a graph stage declares; null when it declares none, so none is compared. */
const outcomesOf = (stage: GraphStage): Set<string> | null =>
  stage.outcome === null ? null : new Set(stage.outcome.values.map(entry => entry.value));

/**
 * Whether an asks-settled arrow of `stage` leaves on `option`. An arrow with no option backs
 * every option unless it is on `withdrawn`: an `answered` or `any` binding starts on whatever
 * answer was chosen, while a withdrawal chooses none.
 */
const optionBacked = (graph: PackGraph, stage: GraphStage, option: string): boolean =>
  graph.arrows.some(
    ({ from }) =>
      'settled' in from &&
      from.stage === stage.name &&
      (from.option === option || (from.option === undefined && from.settled !== 'withdrawn'))
  );

/** What is wrong with one name: undefined when the graph has it. */
function nameProblem(named: Named, stage: GraphStage, graph: PackGraph): string | undefined {
  const { workflow, step, outcome, option } = named;
  if (step !== undefined) {
    const node = stage.nodes.find(entry => entry.id === step);
    if (node === undefined || (named.loop === true && node.kind !== 'loop_group'))
      return `names ${named.loop === true ? 'loop group' : 'step'} "${step}", which workflow "${workflow}" does not have`;
  }
  const outcomes = outcomesOf(stage);
  if (outcome !== undefined && outcome !== '*' && outcomes !== null && !outcomes.has(outcome))
    return `names outcome "${outcome}", which workflow "${workflow}" does not declare`;
  if (option !== undefined && !optionBacked(graph, stage, option))
    return `names option "${option}" of workflow "${workflow}", but no asks-settled hand-off of the pack leaves on it`;
  if (named.result === true && stage.returns === null)
    return `reads the result of workflow "${workflow}", which returns none`;
  return undefined;
}

/**
 * The FAIL tier: every name the view uses that the graph lacks, a retired workflow the pack has
 * again, a drill-down naming a workflow its stage does not list or the view retired, a step
 * two cards cover, and a map label for a pair of stages the graph does not connect.
 */
function failures(view: FactoryView, graph: PackGraph, runNames: RunNames): NameFinding[] {
  const fails: NameFinding[] = [];
  if (graph.discoveryErrors.length > 0)
    fails.push({
      path: [],
      message: `${String(graph.discoveryErrors.length)} of the pack's workflows failed to load: ${graph.discoveryErrors.map(e => e.filename).join(', ')}`,
    });
  const names = graph.stages.map(stage => stage.name);
  view.retired?.forEach((workflow, index) => {
    if (packWorkflowName(names, workflow) !== undefined)
      fails.push({
        path: ['retired', index],
        message: `names retired workflow "${workflow}", which pack "${graph.pack}" still has`,
      });
  });
  const unknownWorkflows = new Set<string>();
  for (const named of namesOf(view)) {
    if (isRetired(view, named.workflow)) continue;
    const stage = graph.stages.find(entry => entry.name === runNames[named.workflow]);
    if (stage === undefined) {
      // Said once per workflow: every other name of it fails with it.
      if (!unknownWorkflows.has(named.workflow))
        fails.push({
          path: named.path,
          message: `names workflow "${named.workflow}", which pack "${graph.pack}" does not have`,
        });
      unknownWorkflows.add(named.workflow);
      continue;
    }
    const problem = nameProblem(named, stage, graph);
    if (problem !== undefined) fails.push({ path: named.path, message: problem });
  }
  return [...fails, ...drilldownFailures(view), ...labelFailures(view, graph, runNames)];
}

/** A card or loop on a workflow its stage does not list or the view retired, and a step covered twice. */
function drilldownFailures(view: FactoryView): NameFinding[] {
  const fails: NameFinding[] = [];
  const seen = new Map<string, ViewPath>();
  view.stages.forEach((stage, s) => {
    for (const named of coverNames({ ...view, stages: [stage] })) {
      const path = ['stages', s, ...named.path.slice(2)];
      if (isRetired(view, named.workflow) || !stage.workflows.includes(named.workflow)) {
        fails.push({
          path,
          message: `stands for a step of workflow "${named.workflow}", which ${isRetired(view, named.workflow) ? 'the view retired' : 'its stage does not list'}`,
        });
        continue;
      }
      const key = `${named.workflow}/${named.step ?? ''}`;
      const first = seen.get(key);
      if (first !== undefined)
        fails.push({
          path,
          message: `covers step "${key}", which ${first.join('.')} already covers`,
        });
      else seen.set(key, path);
    }
  });
  return fails;
}

/** A map label for a pair of stages the map does not draw, since the graph does not connect them. */
function labelFailures(view: FactoryView, graph: PackGraph, runNames: RunNames): NameFinding[] {
  const drawn = new Set(mapArrows(view, graph, runNames).map(a => JSON.stringify([a.from, a.to])));
  return view.map.arrows.flatMap((arrow, index) =>
    drawn.has(JSON.stringify([arrow.from, arrow.to]))
      ? []
      : [
          {
            path: ['map', 'arrows', index],
            message: `labels an arrow from "${arrow.from}" to "${arrow.to}", which the pack graph does not draw`,
          },
        ]
  );
}

/** Whether `record` takes `workflow:outcome`, exactly or by `workflow:*`. */
const takes = (record: Record<string, unknown> | undefined, workflow: string, outcome: string) =>
  record?.[`${workflow}:${outcome}`] !== undefined || record?.[`${workflow}:*`] !== undefined;

/** A workflow that takes part in the pack's hand-offs and that no stage lists. */
function unlistedWarnings(graph: PackGraph, runNames: RunNames): NameFinding[] {
  const listed = new Set(Object.values(runNames));
  const inArrows = new Set(graph.arrows.flatMap(arrow => [arrow.from.stage, arrow.to]));
  return graph.stages
    .filter(stage => inArrows.has(stage.name) && !listed.has(stage.name))
    .map(stage => ({
      path: ['stages'],
      message: `workflow "${stage.name}" takes part in the pack's hand-offs, and no stage lists it`,
    }));
}

/**
 * An outcome of a listed workflow nothing places or ends (a run ending so leaves its item where
 * its earlier runs put it), and, with a `story`, one no sentence tells.
 */
function outcomeWarnings(view: FactoryView, workflow: string, stage: GraphStage): NameFinding[] {
  return [...(outcomesOf(stage) ?? [])].flatMap(outcome => {
    const key = `${workflow}:${outcome}`;
    const warns: NameFinding[] = [];
    if (!takes(view.placement, workflow, outcome) && !takes(view.endings, workflow, outcome))
      warns.push({
        path: ['placement'],
        message: `outcome "${key}" is neither placed nor ended; a run ending so leaves its item where its earlier runs put it`,
      });
    if (view.story !== undefined && !takes(view.story.outcomes, workflow, outcome))
      warns.push({
        path: ['story', 'outcomes'],
        message: `outcome "${key}" has no story sentence`,
      });
    return warns;
  });
}

/** A step of a listed workflow no drill-down card covers. */
function stepWarnings(view: FactoryView, workflow: string, stage: GraphStage): NameFinding[] {
  const covered = new Set(coverNames(view).map(named => `${named.workflow}/${named.step ?? ''}`));
  return stage.nodes
    .filter(node => !covered.has(`${workflow}/${node.id}`))
    .map(node => ({
      path: ['stages'],
      message: `step "${workflow}/${node.id}" is covered by no drill-down card`,
    }));
}

/**
 * The WARN tier: what the graph has that the view leaves out. A workflow the pack hands items
 * to that no stage lists, each listed workflow's untaken outcomes and uncovered steps, and a
 * drawn arrow with no label.
 */
function warnings(view: FactoryView, graph: PackGraph, runNames: RunNames): NameFinding[] {
  const live = [...new Set(view.stages.flatMap(stage => stage.workflows))].filter(
    workflow => !isRetired(view, workflow)
  );
  const perWorkflow = live.flatMap(workflow => {
    const stage = graph.stages.find(entry => entry.name === runNames[workflow]);
    return stage === undefined
      ? []
      : [...outcomeWarnings(view, workflow, stage), ...stepWarnings(view, workflow, stage)];
  });
  const unlabelled = mapArrows(view, graph, runNames)
    .filter(arrow => arrow.label === undefined)
    .map(arrow => ({
      path: ['map', 'arrows'],
      message: `the map draws an arrow from "${arrow.from}" to "${arrow.to}" with no label`,
    }));
  return [...unlistedWarnings(graph, runNames), ...perWorkflow, ...unlabelled];
}

/** Every name `view` uses that `graph` lacks (fails), and what it leaves out (warns). */
export function checkViewNames(view: FactoryView, graph: PackGraph): NameCheck {
  const runNames = viewRunNames(view, graph);
  return { fails: failures(view, graph, runNames), warns: warnings(view, graph, runNames) };
}

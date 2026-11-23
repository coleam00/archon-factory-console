/**
 * Whether a factory view tells the truth about its pack: every real step of a workflow the
 * view lists is covered by exactly one drill-down card (or loop), every step the view names
 * (shadows included) is real, the map's arrows are exactly the hand-offs the pack graph reports between the
 * workflows the view lists, and every outcome such a workflow declares is placed or ended while
 * every outcome the view names is one it declares, and every result the view reads a change or
 * a round from is one the workflow returns. A workflow no stage lists is not compared (`unlistedWorkflows`
 * names them), and nor is a workflow the view declares `retired`: its old runs still read, so
 * the view keeps wording them, and the pack need not have it. The schema cannot see the pack's
 * workflows; this check reads them as the pack graph (`archon pack graph`, `GET /api/packs/{pack}/graph`) reports them.
 * `bun run check:factory-view` runs it over this repository's declarations.
 */
import { packWorkflowName, type PackGraph } from './pack-graph';
import {
  changeSources,
  isLoopRounds,
  roundsSources,
  type FactoryStage,
  type FactoryView,
} from './schemas/factory-view';

export type CoverageFindingKind =
  | 'uncovered'
  | 'covered-twice'
  | 'unknown-step'
  | 'unknown-workflow'
  | 'undeclared-hand-off'
  | 'unbacked-arrow'
  | 'unplaced-outcome'
  | 'untold-outcome'
  | 'unknown-outcome'
  | 'no-result'
  | 'retired-present'
  | 'graph-incomplete';

export interface CoverageFinding {
  kind: CoverageFindingKind;
  /** Where in the view to act, as a zod issue path. */
  path: (string | number)[];
  message: string;
}

type ViewPath = CoverageFinding['path'];
type GraphStage = PackGraph['stages'][number];
type GraphNode = GraphStage['nodes'][number];

const isRetired = (view: FactoryView, workflow: string): boolean =>
  view.retired?.includes(workflow) === true;

/**
 * Each workflow the view lists and has not retired, by its name in the view, to its stage in
 * the graph. Every comparison with the graph reads through it, so a retired workflow is
 * compared nowhere.
 */
function graphStagesOf(view: FactoryView, graph: PackGraph): Map<string, GraphStage> {
  const names = graph.stages.map(stage => stage.name);
  const found = new Map<string, GraphStage>();
  for (const workflow of view.stages.flatMap(stage => stage.workflows)) {
    if (isRetired(view, workflow)) continue;
    // `packWorkflowName` owns how a pack's own name is qualified in an install.
    const name = packWorkflowName(names, workflow);
    const stage = graph.stages.find(entry => entry.name === name);
    if (stage !== undefined) found.set(workflow, stage);
  }
  return found;
}

/**
 * The pack's workflows no stage of the view lists, by their names in the graph and in its
 * order: the check compares none of their steps or hand-offs.
 */
export function unlistedWorkflows(view: FactoryView, graph: PackGraph): string[] {
  const listed = new Set([...graphStagesOf(view, graph).values()].map(stage => stage.name));
  return graph.stages.map(stage => stage.name).filter(name => !listed.has(name));
}

/** A step matches a stage `nodes` entry equal to it, or one it begins with followed by `.`. */
const matchesEntry = (step: string, entry: string): boolean =>
  step === entry || step.startsWith(`${entry}.`);

const stagesListing = (view: FactoryView, workflow: string): FactoryStage[] =>
  view.stages.filter(stage => stage.workflows.includes(workflow));

/**
 * The stage a step of `workflow` counts in: the one whose `nodes` name it, else the first
 * without `nodes`, else the first; a null step (between steps) takes the fallbacks. The web
 * console's `stageOfWorkflow` places a step by the same rule;
 * `__fixtures__/factory-view-step-stages.json` holds the two to it.
 */
export function stageOfWorkflowStep(
  view: FactoryView,
  workflow: string,
  step: string | null
): FactoryStage | undefined {
  const stages = stagesListing(view, workflow);
  const named =
    step === null
      ? undefined
      : stages.find(stage => stage.nodes?.some(entry => matchesEntry(step, entry)) === true);
  return named ?? stages.find(stage => stage.nodes === undefined) ?? stages[0];
}

/** One step or loop a drill-down says it stands for, and where it says so. */
interface Coverer {
  workflow: string;
  step: string;
  path: ViewPath;
  /** A drill-down's loop, which must name a loop group. */
  loop: boolean;
}

function coverersOf(view: FactoryView): Coverer[] {
  return view.stages.flatMap((stage, s) => {
    const { drilldown } = stage;
    if (drilldown === undefined) return [];
    const at = ['stages', s, 'drilldown'];
    const cards = drilldown.phases.flatMap((phase, p) =>
      phase.cards.flatMap((card, c) =>
        card.covers.flatMap((cover, k) =>
          cover.steps.map(
            (step, m): Coverer => ({
              workflow: cover.workflow,
              step,
              path: [...at, 'phases', p, 'cards', c, 'covers', k, 'steps', m],
              loop: false,
            })
          )
        )
      )
    );
    const { loop } = drilldown;
    return loop === undefined
      ? cards
      : [
          ...cards,
          { workflow: loop.workflow, step: loop.step, path: [...at, 'loop', 'step'], loop: true },
        ];
  });
}

const stepKey = (workflow: string, step: string): string => `${workflow}/${step}`;

/** A coverer naming no step of its workflow, or a loop naming a step that is no loop group. */
function unknownCoverer(coverer: Coverer, graphStage: GraphStage): CoverageFinding | undefined {
  const node = graphStage.nodes.find(entry => entry.id === coverer.step);
  if (node !== undefined && (!coverer.loop || node.kind === 'loop_group')) return undefined;
  return {
    kind: 'unknown-step',
    path: coverer.path,
    message: `names ${coverer.loop ? 'loop group' : 'step'} "${coverer.step}", which workflow "${coverer.workflow}" does not have`,
  };
}

/** Every real step covered once, none twice, and every coverer naming a real step. */
function coverageFindings(
  view: FactoryView,
  stages: ReadonlyMap<string, GraphStage>
): CoverageFinding[] {
  const findings: CoverageFinding[] = [];
  const seen = new Map<string, Coverer>();
  for (const coverer of coverersOf(view)) {
    const graphStage = stages.get(coverer.workflow);
    // A workflow the graph lacks is reported once, as unknown-workflow.
    if (graphStage === undefined) continue;
    const unknown = unknownCoverer(coverer, graphStage);
    if (unknown !== undefined) {
      findings.push(unknown);
      continue;
    }
    const key = stepKey(coverer.workflow, coverer.step);
    const first = seen.get(key);
    if (first === undefined) seen.set(key, coverer);
    else
      findings.push({
        kind: 'covered-twice',
        path: coverer.path,
        message: `covers step "${key}", which ${first.path.join('.')} already covers`,
      });
  }
  const uncoveredSteps = [...stages].flatMap(([workflow, graphStage]) =>
    graphStage.nodes
      .filter(node => !seen.has(stepKey(workflow, node.id)))
      .map(node => uncovered(view, workflow, node))
  );
  return [...findings, ...uncoveredSteps];
}

function uncovered(view: FactoryView, workflow: string, node: GraphNode): CoverageFinding {
  const stage = stageOfWorkflowStep(view, workflow, node.id);
  const index = stage === undefined ? -1 : view.stages.indexOf(stage);
  return {
    kind: 'uncovered',
    path: ['stages', index, 'drilldown'],
    message: `step "${stepKey(workflow, node.id)}" is covered by no card`,
  };
}

/**
 * The steps the view itself names for `workflow`: what its drill-down cards and loop cover and
 * what `steps`, `story.steps`, `verdicts`, `returns`, `approves`, a loop-form `rounds` source and
 * `shadows` name. For a retired workflow, which the graph no longer has, this is the record a
 * stage's `nodes` entry is held to.
 */
function viewSteps(view: FactoryView, workflow: string): Set<string> {
  const points = [...(view.returns ?? []), ...(view.approves ?? []), ...(view.shadows ?? [])];
  const loops = roundsSources(view).flatMap(source => (isLoopRounds(source) ? [source] : []));
  const of = <T extends { workflow: string }>(list: readonly T[]): T[] =>
    list.filter(entry => entry.workflow === workflow);
  return new Set([
    ...of(coverersOf(view)).map(coverer => coverer.step),
    ...[view.steps, view.story?.steps, view.verdicts].flatMap(byWorkflow =>
      Object.keys(byWorkflow?.[workflow] ?? {})
    ),
    ...of(points).map(point => point.node),
    ...of(loops).map(source => source.loop),
  ]);
}

/**
 * Every step a stage's `nodes`, the `steps` or the `verdicts` names is a real step of its
 * workflow. A `nodes` entry matches a step of a workflow of the stage the graph has, or one the
 * view names for a retired workflow of the stage (`viewSteps`).
 */
function namedStepFindings(
  view: FactoryView,
  stages: ReadonlyMap<string, GraphStage>
): CoverageFinding[] {
  const findings: CoverageFinding[] = [];
  const unknown = (path: ViewPath, workflow: string, step: string): CoverageFinding => ({
    kind: 'unknown-step',
    path,
    message: `names step "${step}", which workflow "${workflow}" does not have`,
  });
  view.stages.forEach((stage, s) => {
    const retired = stage.workflows.filter(workflow => isRetired(view, workflow));
    const known = [
      ...stage.workflows.flatMap(w => (stages.get(w)?.nodes ?? []).map(node => node.id)),
      ...retired.flatMap(workflow => [...viewSteps(view, workflow)]),
    ];
    stage.nodes?.forEach((entry, n) => {
      if (!known.some(step => matchesEntry(step, entry)))
        findings.push(unknown(['stages', s, 'nodes', n], stage.workflows.join(', '), entry));
    });
  });
  for (const key of ['steps', 'verdicts'] as const)
    for (const [workflow, byStep] of Object.entries(view[key] ?? {})) {
      const graphStage = stages.get(workflow);
      if (graphStage === undefined) continue;
      for (const step of Object.keys(byStep))
        if (!graphStage.nodes.some(node => node.id === step))
          findings.push(unknown([key, workflow, step], workflow, step));
    }
  return findings;
}

/**
 * What the view reads change and rounds from is there: a declared return or approval names a
 * real step, a loop-form rounds source names a loop group of its workflow, and a workflow a
 * stage-form rounds source or a change source reads a result of returns one.
 */
function declaredReadFindings(
  view: FactoryView,
  stages: ReadonlyMap<string, GraphStage>
): CoverageFinding[] {
  const findings: CoverageFinding[] = [];
  for (const key of ['returns', 'approves'] as const)
    view[key]?.forEach((point, index) => {
      const graphStage = stages.get(point.workflow);
      if (graphStage !== undefined && !graphStage.nodes.some(node => node.id === point.node))
        findings.push({
          kind: 'unknown-step',
          path: [key, index, 'node'],
          message: `names step "${point.node}", which workflow "${point.workflow}" does not have`,
        });
    });
  const at = (field: 'change' | 'rounds', index: number, leaf: string): ViewPath =>
    Array.isArray(view[field]) ? [field, index, leaf] : [field, leaf];
  const returnsResult = (path: ViewPath, workflow: string): void => {
    if (stages.get(workflow)?.returns === null)
      findings.push({
        kind: 'no-result',
        path,
        message: `reads the result of workflow "${workflow}", which returns none`,
      });
  };
  roundsSources(view).forEach((source, index) => {
    if (!isLoopRounds(source)) {
      returnsResult(at('rounds', index, 'workflow'), source.workflow);
      return;
    }
    const graphStage = stages.get(source.workflow);
    if (
      graphStage !== undefined &&
      !graphStage.nodes.some(node => node.id === source.loop && node.kind === 'loop_group')
    )
      findings.push({
        kind: 'unknown-step',
        path: at('rounds', index, 'loop'),
        message: `names loop "${source.loop}", which workflow "${source.workflow}" does not have`,
      });
  });
  changeSources(view).forEach((source, index) => {
    returnsResult(at('change', index, 'workflow'), source.workflow);
  });
  return findings;
}

/** A hand-off the pack graph reports, as the pair of stages the map joins with it. */
interface HandOffPair {
  from: string;
  to: string;
  /** The outcome that takes it, or `asks answered`. */
  when: string;
}

/**
 * Each graph arrow between two workflows the view lists, as the stages it joins: from the
 * stage a run of its source ends on (whose `nodes` name the step it returns from, else where
 * its workflow sits), to the stage its target starts on. An arrow into a workflow no stage
 * lists (a drain that moves no item) is not between stages, so no arrow can declare it.
 */
function handOffPairs(view: FactoryView, graph: PackGraph): HandOffPair[] {
  const workflowOf = new Map(
    [...graphStagesOf(view, graph)].map(([workflow, stage]) => [stage.name, { workflow, stage }])
  );
  return graph.arrows.flatMap((arrow): HandOffPair[] => {
    const source = workflowOf.get(arrow.from.stage);
    const target = workflowOf.get(arrow.to);
    if (source === undefined || target === undefined) return [];
    const from = stageOfWorkflowStep(view, source.workflow, source.stage.returns);
    const to = stageOfWorkflowStep(view, target.workflow, null);
    if (from === undefined || to === undefined) return [];
    const when = 'outcome' in arrow.from ? arrow.from.outcome : `asks ${arrow.from.settled}`;
    return [{ from: from.id, to: to.id, when }];
  });
}

/**
 * The map's arrows against the graph's hand-offs, matched by ordered pair of stages, not by
 * label: a declared host -> build arrow labelled "returned" backs deliver's asks-answered
 * hand-off too, and a label is plain words for people. A declared arrow needs no hand-off
 * when a person takes it, when it joins two different stages of one workflow (its steps), or
 * when it runs into the landed stage from another. An arrow back into its own stage is a
 * rerun only a hand-off starts (answered asks), so it is never exempt.
 */
function arrowFindings(view: FactoryView, graph: PackGraph): CoverageFinding[] {
  const pair = (from: string, to: string): string => JSON.stringify([from, to]);
  const pairs = handOffPairs(view, graph);
  const backed = new Set(pairs.map(entry => pair(entry.from, entry.to)));
  const declared = new Set(view.map.arrows.map(arrow => pair(arrow.from, arrow.to)));
  const findings: CoverageFinding[] = pairs
    .filter(entry => !declared.has(pair(entry.from, entry.to)))
    .map(entry => ({
      kind: 'undeclared-hand-off',
      path: ['map', 'arrows'],
      message: `the pack hands an item from "${entry.from}" to "${entry.to}" (${entry.when}); declare that arrow`,
    }));
  const workflowsOf = new Map(view.stages.map(stage => [stage.id, stage.workflows]));
  const shareWorkflow = (from: string, to: string): boolean => {
    const into = workflowsOf.get(to) ?? [];
    return (workflowsOf.get(from) ?? []).some(workflow => into.includes(workflow));
  };
  const exempt = (arrow: FactoryView['map']['arrows'][number]): boolean =>
    arrow.person === true ||
    backed.has(pair(arrow.from, arrow.to)) ||
    (arrow.from !== arrow.to &&
      (arrow.to === view.landed.stage || shareWorkflow(arrow.from, arrow.to)));
  view.map.arrows.forEach((arrow, index) => {
    if (exempt(arrow)) return;
    findings.push({
      kind: 'unbacked-arrow',
      path: ['map', 'arrows', index],
      message: `joins "${arrow.from}" and "${arrow.to}", but no hand-off of the pack does; mark it "person": true if a person takes it`,
    });
  });
  return findings;
}

/**
 * Every shadow names a real step of a real workflow. Resolved against every stage of the graph,
 * not `graphStagesOf`, since a shadow may name the discoveries workflow, which no stage lists.
 */
function shadowFindings(view: FactoryView, graph: PackGraph): CoverageFinding[] {
  const names = graph.stages.map(stage => stage.name);
  const findings: CoverageFinding[] = [];
  view.shadows?.forEach((shadow, index) => {
    if (isRetired(view, shadow.workflow)) return;
    const name = packWorkflowName(names, shadow.workflow);
    const graphStage = graph.stages.find(stage => stage.name === name);
    if (graphStage === undefined)
      findings.push({
        kind: 'unknown-workflow',
        path: ['shadows', index, 'workflow'],
        message: `names workflow "${shadow.workflow}", which pack "${graph.pack}" does not have`,
      });
    else if (!graphStage.nodes.some(node => node.id === shadow.node))
      findings.push({
        kind: 'unknown-step',
        path: ['shadows', index, 'node'],
        message: `names step "${shadow.node}", which workflow "${shadow.workflow}" does not have`,
      });
  });
  return findings;
}

/** The outcomes the graph says a run of the stage can complete with; null when it declares none. */
const outcomesOf = (graphStage: GraphStage): Set<string> | null =>
  graphStage.outcome === null ? null : new Set(graphStage.outcome.values.map(entry => entry.value));

const outcomeKey = (key: string): { workflow: string; outcome: string } => {
  const at = key.lastIndexOf(':');
  return { workflow: key.slice(0, at), outcome: key.slice(at + 1) };
};

/**
 * Every outcome a listed workflow declares is placed or ended, exactly or by `workflow:*`, so a
 * completed run never leaves its item where no rule put it on purpose. A workflow whose stage
 * declares no outcome (a gate that only records) is not compared.
 */
function unplacedOutcomeFindings(
  view: FactoryView,
  stages: ReadonlyMap<string, GraphStage>
): CoverageFinding[] {
  const taken = (key: string): boolean =>
    view.placement[key] !== undefined || view.endings[key] !== undefined;
  return [...stages].flatMap(([workflow, graphStage]) =>
    [...(outcomesOf(graphStage) ?? [])]
      .filter(outcome => !taken(`${workflow}:${outcome}`) && !taken(`${workflow}:*`))
      .map(
        (outcome): CoverageFinding => ({
          kind: 'unplaced-outcome',
          path: ['placement'],
          message: `outcome "${workflow}:${outcome}" is neither placed nor ended`,
        })
      )
  );
}

/**
 * With a `story`, every outcome a listed workflow declares has its sentence, exactly or by
 * `workflow:*`, so the item page never falls back to its neutral words for a declared outcome.
 */
function untoldOutcomeFindings(
  view: FactoryView,
  stages: ReadonlyMap<string, GraphStage>
): CoverageFinding[] {
  const { story } = view;
  if (story === undefined) return [];
  const told = (key: string): boolean => story.outcomes[key] !== undefined;
  return [...stages].flatMap(([workflow, graphStage]) =>
    [...(outcomesOf(graphStage) ?? [])]
      .filter(outcome => !told(`${workflow}:${outcome}`) && !told(`${workflow}:*`))
      .map(
        (outcome): CoverageFinding => ({
          kind: 'untold-outcome',
          path: ['story', 'outcomes'],
          message: `outcome "${workflow}:${outcome}" has no story sentence`,
        })
      )
  );
}

/** Every step `story.steps` words is a real step of its workflow. */
function storyStepFindings(
  view: FactoryView,
  stages: ReadonlyMap<string, GraphStage>
): CoverageFinding[] {
  return Object.entries(view.story?.steps ?? {}).flatMap(([workflow, byStep]) => {
    const graphStage = stages.get(workflow);
    if (graphStage === undefined) return [];
    return Object.keys(byStep)
      .filter(step => !graphStage.nodes.some(node => node.id === step))
      .map(
        (step): CoverageFinding => ({
          kind: 'unknown-step',
          path: ['story', 'steps', workflow, step],
          message: `names step "${step}", which workflow "${workflow}" does not have`,
        })
      );
  });
}

/**
 * Every exact `workflow:outcome` key of `placement`, `endings`, `parked`, `awaits`, `asked` and
 * `story.outcomes` names an
 * outcome the workflow declares. A `*` key, and a workflow whose stage declares no outcome, are
 * not compared; a workflow the graph lacks is reported as unknown-workflow.
 */
function unknownOutcomeFindings(
  view: FactoryView,
  stages: ReadonlyMap<string, GraphStage>
): CoverageFinding[] {
  const keys: [ViewPath, string][] = [
    ...Object.keys(view.placement).map((key): [ViewPath, string] => [['placement', key], key]),
    ...Object.keys(view.endings).map((key): [ViewPath, string] => [['endings', key], key]),
    ...Object.keys(view.parked ?? {}).map((key): [ViewPath, string] => [['parked', key], key]),
    ...Object.keys(view.awaits ?? {}).map((key): [ViewPath, string] => [['awaits', key], key]),
    ...(view.asked ?? []).map((key, index): [ViewPath, string] => [['asked', index], key]),
    ...Object.keys(view.story?.outcomes ?? {}).map((key): [ViewPath, string] => [
      ['story', 'outcomes', key],
      key,
    ]),
  ];
  return keys.flatMap(([path, key]): CoverageFinding[] => {
    const { workflow, outcome } = outcomeKey(key);
    const graphStage = stages.get(workflow);
    const declared = graphStage === undefined ? null : outcomesOf(graphStage);
    if (outcome === '*' || declared === null || declared.has(outcome)) return [];
    return [
      {
        kind: 'unknown-outcome',
        path,
        message: `names outcome "${outcome}", which workflow "${workflow}" does not declare`,
      },
    ];
  });
}

/** Every way `view` disagrees with the pack's real workflows and hand-offs; empty when none. */
export function factoryViewCoverage(view: FactoryView, graph: PackGraph): CoverageFinding[] {
  const stages = graphStagesOf(view, graph);
  const findings: CoverageFinding[] = [];
  if (graph.discoveryErrors.length > 0)
    findings.push({
      kind: 'graph-incomplete',
      path: [],
      message: `${String(graph.discoveryErrors.length)} of the pack's workflows failed to load: ${graph.discoveryErrors.map(e => e.filename).join(', ')}`,
    });
  const names = graph.stages.map(stage => stage.name);
  view.retired?.forEach((workflow, index) => {
    if (packWorkflowName(names, workflow) !== undefined)
      findings.push({
        kind: 'retired-present',
        path: ['retired', index],
        message: `names retired workflow "${workflow}", which pack "${graph.pack}" still has; remove it from retired or stop retiring it`,
      });
  });
  view.stages.forEach((stage, s) => {
    stage.workflows.forEach((workflow, w) => {
      if (!stages.has(workflow) && !isRetired(view, workflow))
        findings.push({
          kind: 'unknown-workflow',
          path: ['stages', s, 'workflows', w],
          message: `names workflow "${workflow}", which pack "${graph.pack}" does not have`,
        });
    });
  });
  // The discoveries workflow places no item, so only its existence is checked: no steps or
  // hand-offs of it are compared, and `unlistedWorkflows` still names it.
  const { discoveries } = view;
  if (discoveries !== undefined) {
    if (packWorkflowName(names, discoveries.workflow) === undefined)
      findings.push({
        kind: 'unknown-workflow',
        path: ['discoveries', 'workflow'],
        message: `names workflow "${discoveries.workflow}", which pack "${graph.pack}" does not have`,
      });
  }
  // Loop groups count as steps. Fan-out bodies (`graph.fanOutBlocks`) do not: a fan-out
  // include is one node of its stage; this pack has none.
  return [
    ...findings,
    ...coverageFindings(view, stages),
    ...namedStepFindings(view, stages),
    ...declaredReadFindings(view, stages),
    ...arrowFindings(view, graph),
    ...shadowFindings(view, graph),
    ...unplacedOutcomeFindings(view, stages),
    ...unknownOutcomeFindings(view, stages),
    ...untoldOutcomeFindings(view, stages),
    ...storyStepFindings(view, stages),
  ];
}

/**
 * Whether a factory view file agrees with its pack's graph. The file is presentation only: it
 * gives the graph's stages, steps and outcomes words, a card and a position. So a name it uses
 * that the graph lacks is an ERROR, and what the graph has that it leaves out is a WARNING,
 * which is how a new stage gets noticed. The route serving the file and
 * `bun run check:factory-view` both run this.
 *
 * A view names a stage by its name within the pack (the graph stage's `workflow`), as the pack
 * document's groups do. A workflow the view declares `retired` is not required of the pack, and
 * nothing named under it is compared.
 */
import type { PackGraph } from './pack-graph';
import type { FactoryViewFile } from './schemas/factory-view';

export interface FactoryViewProblem {
  severity: 'error' | 'warning';
  /** Where in the file to act, as a zod issue path. */
  path: (string | number)[];
  message: string;
}

type GraphStage = PackGraph['stages'][number];
type ProblemPath = FactoryViewProblem['path'];

const error = (path: ProblemPath, message: string): FactoryViewProblem => ({
  severity: 'error',
  path,
  message,
});
const warning = (path: ProblemPath, message: string): FactoryViewProblem => ({
  severity: 'warning',
  path,
  message,
});

/** The graph read for one view: stages by their name within the pack, and what retired names. */
interface CheckContext {
  view: FactoryViewFile;
  graph: PackGraph;
  stages: ReadonlyMap<string, GraphStage>;
  retired: ReadonlySet<string>;
}

const splitKey = (key: string): { workflow: string; name: string } => {
  const at = key.lastIndexOf(':');
  return { workflow: key.slice(0, at), name: key.slice(at + 1) };
};

/** A name the view uses, with the step or outcome it names under that stage. */
interface Named {
  path: ProblemPath;
  workflow: string;
  step?: string;
  outcome?: string;
}

function namesOf(view: FactoryViewFile): Named[] {
  const byStep = (at: string[], record: Record<string, Record<string, unknown>> | undefined) =>
    Object.entries(record ?? {}).flatMap(([workflow, steps]): Named[] => [
      { path: [...at, workflow], workflow },
      ...Object.keys(steps).map(step => ({ path: [...at, workflow, step], workflow, step })),
    ]);
  const byOutcome = (at: string[], record: Record<string, unknown> | undefined) =>
    Object.keys(record ?? {}).map((key): Named => {
      const { workflow, name } = splitKey(key);
      return { path: [...at, key], workflow, outcome: name };
    });
  return [
    ...view.stages.flatMap((card, c) =>
      card.workflows.map(
        (workflow, w): Named => ({ path: ['stages', c, 'workflows', w], workflow })
      )
    ),
    ...byStep(['steps'], view.steps),
    ...byStep(['story', 'steps'], view.story?.steps),
    ...byOutcome(['endings'], view.endings),
    ...byOutcome(['story', 'outcomes'], view.story?.outcomes),
  ];
}

/** The step ids a stage records: its nodes and the bodies of the fan-outs it names. */
function stepIds(graph: PackGraph, stage: GraphStage): Set<string> {
  const ids = new Set(stage.nodes.map(node => node.id));
  for (const node of stage.nodes) {
    if (node.fanOut === null) continue;
    const body = graph.fanOutBlocks.find(block => block.workflow === node.fanOut?.workflow);
    for (const inner of body?.nodes ?? []) ids.add(inner.id);
  }
  return ids;
}

/** What is wrong with one name the graph has the stage of: undefined when nothing is. */
function nameProblem(named: Named, stage: GraphStage, graph: PackGraph): string | undefined {
  const { workflow, step, outcome } = named;
  if (step !== undefined && !stepIds(graph, stage).has(step))
    return `names step "${step}", which stage "${workflow}" does not have`;
  if (outcome === undefined || outcome === '*') return undefined;
  if (stage.outcome === null)
    return `names outcome "${outcome}" of stage "${workflow}", which declares none`;
  if (!stage.outcome.values.some(entry => entry.value === outcome))
    return `names outcome "${outcome}", which stage "${workflow}" does not declare`;
  return undefined;
}

/** Every stage, step and outcome name the graph lacks, said once per unknown stage. */
function nameProblems(ctx: CheckContext): FactoryViewProblem[] {
  const problems: FactoryViewProblem[] = [];
  const unknown = new Set<string>();
  for (const named of namesOf(ctx.view)) {
    if (ctx.retired.has(named.workflow)) continue;
    const stage = ctx.stages.get(named.workflow);
    if (stage === undefined) {
      if (!unknown.has(named.workflow))
        problems.push(
          error(
            named.path,
            `names stage "${named.workflow}", which pack "${ctx.graph.pack}" does not have`
          )
        );
      unknown.add(named.workflow);
      continue;
    }
    const problem = nameProblem(named, stage, ctx.graph);
    if (problem !== undefined) problems.push(error(named.path, problem));
  }
  return problems;
}

/**
 * Each graph stage sits on at most one card, a card's stages sit in one document group, a
 * group the view words is one the document has, and every stage work flows through is on a card.
 */
function placementProblems(ctx: CheckContext): FactoryViewProblem[] {
  const problems: FactoryViewProblem[] = [];
  const groupOf = new Map<string, string>();
  for (const group of ctx.graph.groups)
    for (const stage of group.stages) groupOf.set(stage, group.name);
  const cardOf = new Map<string, string>();
  ctx.view.stages.forEach((card, c) => {
    const groups = new Set<string>();
    for (const workflow of card.workflows) {
      if (!ctx.stages.has(workflow)) continue;
      const first = cardOf.get(workflow);
      if (first !== undefined && first !== card.id)
        problems.push(
          error(['stages', c, 'workflows'], `stage "${workflow}" is on card "${first}" already`)
        );
      cardOf.set(workflow, card.id);
      const group = groupOf.get(workflow);
      if (group !== undefined) groups.add(group);
    }
    if (groups.size > 1)
      problems.push(
        error(
          ['stages', c, 'workflows'],
          `holds stages of groups ${[...groups].map(g => `"${g}"`).join(' and ')}; a card sits in one group`
        )
      );
  });
  for (const name of Object.keys(ctx.view.groups ?? {}))
    if (!ctx.graph.groups.some(group => group.name === name))
      problems.push(
        error(['groups', name], `names group "${name}", which the pack document does not declare`)
      );
  for (const stage of ctx.graph.stages)
    if (stage.inFlow && !cardOf.has(stage.workflow))
      problems.push(warning(['stages'], `stage "${stage.workflow}" is unplaced: no card holds it`));
  return problems;
}

/** Retired workflows the pack has again, and a graph that did not load whole. */
function graphProblems(ctx: CheckContext): FactoryViewProblem[] {
  const problems: FactoryViewProblem[] = [];
  if (ctx.graph.discoveryErrors.length > 0)
    problems.push(
      error(
        [],
        `${String(ctx.graph.discoveryErrors.length)} of the pack's workflows failed to load, so the graph is incomplete: ${ctx.graph.discoveryErrors.map(e => e.filename).join(', ')}`
      )
    );
  ctx.view.retired?.forEach((workflow, index) => {
    if (ctx.stages.has(workflow))
      problems.push(
        warning(
          ['retired', index],
          `retires stage "${workflow}", which pack "${ctx.graph.pack}" still has`
        )
      );
  });
  return problems;
}

/** Each pair of cards the graph connects: an arrow runs from a stage of one to a stage of the other. */
function connectedCards(ctx: CheckContext): Set<string> {
  const cardOf = new Map<string, string>();
  for (const card of ctx.view.stages)
    for (const workflow of card.workflows) cardOf.set(workflow, card.id);
  const byName = new Map(ctx.graph.stages.map(stage => [stage.name, stage.workflow]));
  const pairs = new Set<string>();
  for (const arrow of ctx.graph.arrows) {
    // A depends-on link starts the next stage on another item; it carries no item between cards.
    if (arrow.linked?.kind === 'depends_on') continue;
    const from = cardOf.get(byName.get(arrow.from.stage) ?? '');
    const to = cardOf.get(byName.get(arrow.to) ?? '');
    if (from !== undefined && to !== undefined) pairs.add(JSON.stringify([from, to]));
  }
  return pairs;
}

/**
 * A map label or a How it works edge between two stage cards joins a pair the graph connects.
 * A How it works card stands for a stage card when the view it opens has that card's id; a
 * stage card no How it works card stands for is a warning (owner's ruling on #172).
 */
function edgeProblems(ctx: CheckContext): FactoryViewProblem[] {
  const pairs = connectedCards(ctx);
  const joined = (from: string, to: string): boolean => pairs.has(JSON.stringify([from, to]));
  const problems: FactoryViewProblem[] = [];
  ctx.view.map?.labels?.forEach((label, index) => {
    if (!joined(label.from, label.to))
      problems.push(
        error(
          ['map', 'labels', index],
          `labels an arrow from "${label.from}" to "${label.to}", which the pack graph does not connect`
        )
      );
  });
  const cardIds = new Set(ctx.view.stages.map(card => card.id));
  const shown = new Set<string>();
  for (const [viewId, picture] of Object.entries(ctx.view.howItWorks.views)) {
    const standsFor = new Map<string, string>();
    for (const card of picture.cards)
      if (card.opens !== undefined && cardIds.has(card.opens)) {
        standsFor.set(card.id, card.opens);
        shown.add(card.opens);
      }
    picture.edges.forEach((edge, index) => {
      const from = standsFor.get(edge.from);
      const to = standsFor.get(edge.to);
      if (from === undefined || to === undefined || joined(from, to)) return;
      problems.push(
        error(
          ['howItWorks', 'views', viewId, 'edges', index],
          `draws an edge from stage card "${from}" to "${to}", which the pack graph does not connect`
        )
      );
    });
  }
  for (const id of cardIds)
    if (!shown.has(id))
      problems.push(
        warning(['howItWorks'], `stage card "${id}" is opened by no How it works card`)
      );
  return problems;
}

/** Every problem `view` has against `graph`: errors for names the graph lacks, warnings for what it leaves out. */
export function checkFactoryView(view: FactoryViewFile, graph: PackGraph): FactoryViewProblem[] {
  const ctx: CheckContext = {
    view,
    graph,
    stages: new Map(graph.stages.map(stage => [stage.workflow, stage])),
    retired: new Set(view.retired ?? []),
  };
  return [
    ...graphProblems(ctx),
    ...nameProblems(ctx),
    ...placementProblems(ctx),
    ...edgeProblems(ctx),
  ];
}

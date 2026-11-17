/**
 * The map's hand-offs between workflows, from the pack graph read (`GET /api/packs/{pack}/graph`,
 * what `archon pack graph` prints) rather than from the declaration: a run of one stage ending
 * with an outcome, or the asks it left being settled, starts another workflow. The declaration
 * only says where each arrow is drawn: which card a graph stage's run ends on, and which card
 * the workflow it starts begins on. Hand-offs inside one workflow stay declared (`map.arrows`),
 * since the graph reports stages, not the steps inside one.
 */
import type { PackGraph } from '../../skills/packs';
import { stageOfStep, stageOfWorkflow } from './placement';
import type { FactoryViewListed } from './views';

type Declaration = FactoryViewListed['declaration'];
type GraphStage = PackGraph['stages'][number];
type GraphEdge = PackGraph['arrows'][number];

/**
 * How an arrow is drawn: `solid` when a trigger file in this install starts it, `problem`
 * when one does but its check refuses a run (so it starts nothing), `declared` when the pack
 * declares it and no file here starts it.
 */
export type GraphArrowStyle = 'solid' | 'problem' | 'declared';

/** A hand-off between two cards, as the pack graph reports it. */
export interface GraphArrow {
  from: string;
  to: string;
  /** The outcomes that take it, joined (`build, narrow`), or `asks answered`. */
  label: string;
  style: GraphArrowStyle;
  /** What the install's check finds wrong with the trigger files of a `problem` arrow. */
  problems: string[];
}

/** Outcomes of the runs ending on one card that start nothing and leave no ask. */
export interface MapStub {
  stage: string;
  /** The outcomes, joined. */
  label: string;
}

/** A start the graph reports whose workflow has no card on this map. */
export interface OffMapStart {
  /** The card the starting run ends on. */
  from: string;
  /** The workflow that ends, as the view names it. */
  workflow: string;
  /** The outcomes that start it, joined, or `asks answered`. */
  when: string;
  /** The workflow it starts, as the graph names it. */
  starts: string;
}

export interface MapGraph {
  arrows: GraphArrow[];
  stubs: MapStub[];
  offMap: OffMapStart[];
  /** How many of the pack's workflows failed to load: the graph may be missing stages. */
  failedToLoad: number;
}

function styleOf(edge: GraphEdge): GraphArrowStyle {
  if (!edge.active) return 'declared';
  return edge.installed.problems.length === 0 ? 'solid' : 'problem';
}

const whenOf = (edge: GraphEdge): string =>
  'outcome' in edge.from ? edge.from.outcome : `asks ${edge.from.settled}`;

/**
 * Where a run of `stage` ends: the card whose `nodes` name the step it returns from, else
 * where its workflow sits when no step names it.
 */
function endCard(view: Declaration, workflow: string, stage: GraphStage): string | undefined {
  const byReturn = stage.returns === null ? undefined : stageOfStep(view, workflow, stage.returns);
  return (byReturn ?? stageOfWorkflow(view, workflow, null))?.id;
}

/** Arrows with the same ends, kind and style, as one arrow labelled with every outcome. */
function merged(arrows: readonly (GraphArrow & { kind: string })[]): GraphArrow[] {
  const byKey = new Map<string, GraphArrow & { kind: string }>();
  for (const arrow of arrows) {
    const key = [arrow.from, arrow.to, arrow.kind, arrow.style].join('|');
    const seen = byKey.get(key);
    if (seen === undefined) byKey.set(key, { ...arrow, problems: [...arrow.problems] });
    else {
      seen.label = `${seen.label}, ${arrow.label}`;
      seen.problems.push(...arrow.problems);
    }
  }
  return [...byKey.values()].map(({ kind: _kind, ...arrow }) => arrow);
}

/**
 * The outcomes of each card's runs that no arrow at all leaves, active or declared, on stages
 * that leave no asks. An outcome that only a declared arrow leaves is drawn as that arrow, not
 * as an end, so a home with no trigger files does not show every outcome ending.
 */
function stubsOf(
  view: Declaration,
  graph: PackGraph,
  declaredOf: ReadonlyMap<string, string>
): MapStub[] {
  const leaving = new Set(
    graph.arrows.flatMap(edge =>
      'outcome' in edge.from ? [`${edge.from.stage}:${edge.from.outcome}`] : []
    )
  );
  const byCard = new Map<string, string[]>();
  for (const stage of graph.stages) {
    const workflow = declaredOf.get(stage.name);
    if (workflow === undefined || stage.asks || stage.outcome === null) continue;
    const card = endCard(view, workflow, stage);
    if (card === undefined) continue;
    const ends = stage.outcome.values
      .filter(value => value.startsNothing && !leaving.has(`${stage.name}:${value.value}`))
      .map(value => value.value);
    if (ends.length > 0) byCard.set(card, [...(byCard.get(card) ?? []), ...ends]);
  }
  return [...byCard].map(([stage, ends]) => ({ stage, label: ends.join(', ') }));
}

/**
 * The map's graph layer: each arrow between two stages the view declares, drawn from the card
 * a run of its source ends on to the card the workflow it starts begins on; each start of a
 * workflow with no card, listed instead; and each card's ends. Graph stages the view does not
 * declare (included or sub-workflows) are not on the map.
 */
export function mapArrowsFromGraph(
  view: Declaration,
  runNames: Readonly<Record<string, string>>,
  graph: PackGraph
): MapGraph {
  const declaredOf = new Map(Object.entries(runNames).map(([workflow, run]) => [run, workflow]));
  const stages = new Map(graph.stages.map(stage => [stage.name, stage]));
  const cards = new Set(view.map.cards.map(card => card.stage));
  const arrows: (GraphArrow & { kind: string })[] = [];
  const offMap: OffMapStart[] = [];
  for (const edge of graph.arrows) {
    const workflow = declaredOf.get(edge.from.stage);
    const stage = stages.get(edge.from.stage);
    if (workflow === undefined || stage === undefined) continue;
    const from = endCard(view, workflow, stage);
    if (from === undefined) continue;
    const toWorkflow = declaredOf.get(edge.to);
    const to = toWorkflow === undefined ? undefined : stageOfWorkflow(view, toWorkflow, null)?.id;
    if (to === undefined || !cards.has(to)) {
      offMap.push({ from, workflow, when: whenOf(edge), starts: edge.to });
      continue;
    }
    const style = styleOf(edge);
    arrows.push({
      from,
      to,
      label: whenOf(edge),
      style,
      problems: edge.active ? edge.installed.problems : [],
      kind: 'outcome' in edge.from ? 'outcome' : 'asks',
    });
  }
  return {
    arrows: merged(arrows),
    stubs: stubsOf(view, graph, declaredOf),
    offMap,
    failedToLoad: graph.discoveryErrors.length,
  };
}

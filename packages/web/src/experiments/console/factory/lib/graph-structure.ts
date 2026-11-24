/**
 * The factory's structure, read from the pack graph (`GET /api/packs/{pack}/graph`): the steps
 * of a stage and the arrows between stages. The view file only words them and places them
 * (DESIGN.md, v2 direction); this is the one place that joins the two.
 *
 * Pure and free of runtime imports, so `bun run check:factory-view` reads the same projection:
 * a label the check accepts is one for an arrow the map draws.
 */
import type { components } from '../../../../lib/api.generated';

export type PackGraph = components['schemas']['PackGraph'];

/** What of the view the projection reads: which stages list which workflows, and the words. */
export interface StructureView {
  stages: readonly { id: string; label: string; workflows: readonly string[] }[];
  retired?: readonly string[];
  map: { arrows: readonly { from: string; to: string; label: string }[] };
}

/**
 * Each workflow as the view names it, to its name in the graph (`owner/name:workflow` when
 * installed): the views listing's `runNames`.
 */
export type RunNames = Readonly<Record<string, string>>;

/** One arrow the map draws, between two stages, with the view's words for it when it gives them. */
export interface MapArrow {
  from: string;
  to: string;
  label: string | undefined;
}

const isRetired = (view: Pick<StructureView, 'retired'>, workflow: string): boolean =>
  view.retired?.includes(workflow) === true;

/** The stage of each graph workflow the view lists and has not retired: the first listing it. */
function stageByGraphName(view: StructureView, runNames: RunNames): Map<string, string> {
  const stages = new Map<string, string>();
  for (const stage of view.stages)
    for (const workflow of stage.workflows) {
      const name = runNames[workflow];
      if (name === undefined || isRetired(view, workflow) || stages.has(name)) continue;
      stages.set(name, stage.id);
    }
  return stages;
}

/**
 * Every pair of stages the graph connects, once each: the view's labelled pairs in its order,
 * then the rest in the graph's order, since the map lays its pills and lanes out in this order.
 *
 * Every arrow counts, active or not: an install without trigger files still runs the pack's
 * declared hand-offs. Two kinds are left out. An arrow over a `depends_on` link restarts a stage
 * on another item that waits there, so it moves no item between stages. An arrow into or out of
 * a workflow no stage lists (a drain) joins no two stages.
 */
export function mapArrows(view: StructureView, graph: PackGraph, runNames: RunNames): MapArrow[] {
  const stageOf = stageByGraphName(view, runNames);
  const key = (from: string, to: string): string => JSON.stringify([from, to]);
  const drawn = new Map<string, MapArrow>();
  for (const arrow of graph.arrows) {
    if (arrow.linked?.kind === 'depends_on') continue;
    const from = stageOf.get(arrow.from.stage);
    const to = stageOf.get(arrow.to);
    if (from === undefined || to === undefined || drawn.has(key(from, to))) continue;
    drawn.set(key(from, to), { from, to, label: undefined });
  }
  const ordered: MapArrow[] = [];
  for (const entry of view.map.arrows) {
    const arrow = drawn.get(key(entry.from, entry.to));
    if (arrow === undefined) continue;
    ordered.push({ ...arrow, label: entry.label });
    drawn.delete(key(entry.from, entry.to));
  }
  return [...ordered, ...drawn.values()];
}

/** One arrow out of a stage, in the view file's words. */
export interface HandOff {
  /** The arrow's label; undefined for an unlabelled one. */
  label: string | undefined;
  /** The stage it goes to, by id and by its label. */
  to: string;
  toLabel: string;
}

/**
 * Where items go from a stage: every arrow the map draws out of it into another stage. This is
 * where a map pill's outcomes past its two lines are listed in full. An arrow back into the
 * stage itself goes nowhere and is left out.
 */
export function stageHandOffs(
  view: Pick<StructureView, 'stages'>,
  arrows: readonly MapArrow[],
  stageId: string
): HandOff[] {
  return arrows
    .filter(arrow => arrow.from === stageId && arrow.to !== stageId)
    .map(arrow => ({
      label: arrow.label,
      to: arrow.to,
      toLabel: view.stages.find(stage => stage.id === arrow.to)?.label ?? arrow.to,
    }));
}

/** One workflow of a stage and its steps, by step id in the graph's order. */
export interface StageWorkflowSteps {
  workflow: string;
  /** Undefined when the graph has no such workflow. */
  steps: string[] | undefined;
}

/**
 * The steps of each workflow `stage` lists and the view has not retired, from the graph. A
 * retired workflow still places its old runs in the stage, but the pack has nothing to list.
 */
export function stageSteps(
  view: Pick<StructureView, 'retired'>,
  stage: { workflows: readonly string[] },
  graph: PackGraph,
  runNames: RunNames
): StageWorkflowSteps[] {
  return stage.workflows
    .filter(workflow => !isRetired(view, workflow))
    .map(workflow => {
      const name = runNames[workflow];
      const found = graph.stages.find(entry => entry.name === name);
      return { workflow, steps: found?.nodes.map(node => node.id) };
    });
}

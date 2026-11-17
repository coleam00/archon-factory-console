import dagre from '@dagrejs/dagre';
import type { StepGraph, StepGraphGroup, StepGraphNode } from './step-graph';

// RunGraphPanel's sizes, so a workflow looks the same here as on a run.
export const STEP_W = 168;
export const STEP_H = 46;
const RANK_SEP = 58;
const NODE_SEP = 32;
export const STEP_GRAPH_PADDING = 30;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LaidOutStep extends Box {
  node: StepGraphNode;
}

export interface LaidOutGroup extends Box {
  group: StepGraphGroup;
}

export interface LaidOutEdge {
  from: string;
  to: string;
  /** An orthogonal elbow path, as RunGraphPanel draws. */
  d: string;
}

export interface StepGraphLayout {
  steps: LaidOutStep[];
  /** Outer groups first, so inner frames draw over them. */
  groups: LaidOutGroup[];
  edges: LaidOutEdge[];
  width: number;
  height: number;
}

/**
 * Lay a step graph out top to bottom with dagre, each group a compound node around its
 * steps. Edges only join steps: dagre's compound layout does not take edges on a group.
 */
export function layoutStepGraph(graph: StepGraph): StepGraphLayout {
  // A group holds at least one step; an empty one would be laid out as a zero-size node.
  const used = usedGroups(graph);
  const g = dagreGraph(graph, used);
  dagre.layout(g);
  const box = (id: string): Box => {
    const laid = g.node(id) as { x: number; y: number; width: number; height: number };
    return {
      x: laid.x - laid.width / 2,
      y: laid.y - laid.height / 2,
      width: laid.width,
      height: laid.height,
    };
  };
  const steps = graph.nodes.map(node => ({ node, ...box(node.key) }));
  const byKey = new Map(steps.map(step => [step.node.key, step]));
  const size = g.graph();
  return {
    steps,
    groups: graph.groups
      .filter(group => used.has(group.id))
      .map(group => ({ group, ...box(group.id) })),
    edges: graph.edges.flatMap(({ from, to }) => {
      const a = byKey.get(from);
      const b = byKey.get(to);
      return a === undefined || b === undefined ? [] : [{ from, to, d: elbow(a, b) }];
    }),
    width: size.width ?? 0,
    height: size.height ?? 0,
  };
}

function dagreGraph(graph: StepGraph, used: ReadonlySet<string>): dagre.graphlib.Graph {
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'TB',
    ranksep: RANK_SEP,
    nodesep: NODE_SEP,
    marginx: STEP_GRAPH_PADDING,
    marginy: STEP_GRAPH_PADDING,
  });
  const groups = graph.groups.filter(group => used.has(group.id));
  for (const group of groups) g.setNode(group.id, {});
  for (const group of groups) if (group.parent !== null) g.setParent(group.id, group.parent);
  for (const node of graph.nodes) {
    g.setNode(node.key, { width: STEP_W, height: STEP_H });
    if (node.group !== null) g.setParent(node.key, node.group);
  }
  for (const edge of graph.edges) g.setEdge(edge.from, edge.to);
  return g;
}

function usedGroups(graph: StepGraph): Set<string> {
  const parents = new Map(graph.groups.map(group => [group.id, group.parent]));
  const used = new Set<string>();
  for (const node of graph.nodes)
    for (let group = node.group; group !== null; group = parents.get(group) ?? null)
      used.add(group);
  return used;
}

/** Drop from the source's bottom centre, elbow halfway, into the target's top centre. */
function elbow(a: Box, b: Box): string {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height;
  const bx = b.x + b.width / 2;
  const by = b.y;
  if (ax === bx) return `M${ax.toString()},${ay.toString()} V${by.toString()}`;
  const mid = ay + (by - ay) / 2;
  return `M${ax.toString()},${ay.toString()} V${mid.toString()} H${bx.toString()} V${by.toString()}`;
}

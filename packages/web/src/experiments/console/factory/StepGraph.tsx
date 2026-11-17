import { useMemo, type CSSProperties, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import type { StepGraph as StepGraphData, StepGraphNode } from './lib/step-graph';
import {
  layoutStepGraph,
  STEP_GRAPH_PADDING,
  STEP_H,
  STEP_W,
  type LaidOutGroup,
  type LaidOutStep,
} from './lib/step-graph-layout';
import type { ItemOnStep } from './lib/items-on-step';
import type { StepPageState } from './lib/stage-steps';
import { engineIdTitle } from './lib/step-label';
import { factoryPath } from './lib/views';

interface StepGraphProps {
  projectId: string;
  /** The workflow as the factory view names it; the step page's route takes this name. */
  workflow: string;
  /** The stage drawing this graph; the step page leads back to it. */
  stageId: string;
  graph: StepGraphData;
  /** The items on each step now, keyed by step key or loop id; nothing glows without it. */
  running?: ReadonlyMap<string, readonly ItemOnStep[]>;
}

const NOT_RUNNING: readonly ItemOnStep[] = [];

/**
 * RunGraphPanel's running tint, held still: the items read carries no owner liveness, so a
 * pulse would claim more than it knows.
 */
const RUNNING_GLOW: CSSProperties = {
  background: 'color-mix(in oklch, var(--running), transparent 90%)',
  borderColor: 'color-mix(in oklch, var(--running), transparent 40%)',
  boxShadow: '0 0 0 3px color-mix(in oklch, var(--running), transparent 85%)',
};

function runningFor(onStep: readonly ItemOnStep[]): string {
  return `Running for ${onStep.map(({ item }) => item.item.key).join(', ')}`;
}

/**
 * One workflow's steps, top to bottom (RunGraphPanel's canvas, nodes and connectors), with
 * each loop group framed and labelled with its rounds and each included workflow framed in
 * dashes. A step another stage works is dimmed, and so is the label of a frame holding none
 * of this stage's steps, unless an item is on it now: a running step, or a loop between its
 * bodies, glows whichever stage works it. Clicking a step opens its page.
 */
export function StepGraph({
  projectId,
  workflow,
  stageId,
  graph,
  running,
}: StepGraphProps): ReactElement {
  const navigate = useNavigate();
  const laid = useMemo(() => layoutStepGraph(graph), [graph]);
  const framesInStage = useMemo(() => groupsHoldingStageSteps(graph), [graph]);
  const size: CSSProperties = {
    width: Math.max(laid.width, STEP_W + STEP_GRAPH_PADDING * 2),
    height: Math.max(laid.height, STEP_H + STEP_GRAPH_PADDING * 2),
  };
  return (
    <div
      // Not justify-center: a graph wider than the box would overflow to the left, out of
      // reach of the scrollbar. mx-auto centres it when it fits.
      className="w-full overflow-auto rounded-console-12 border border-border p-4"
      // Dotted canvas, as RunGraphPanel draws it.
      style={{
        background:
          'radial-gradient(circle at 1px 1px, color-mix(in oklch, white, transparent 95%) 1px, transparent 0) 0 0 / 26px 26px',
      }}
    >
      <div className="relative mx-auto" style={size}>
        {/* Under the frames, so a frame's label stays readable where an edge crosses it. */}
        <svg
          className="absolute inset-0 overflow-visible"
          width={size.width}
          height={size.height}
          aria-hidden
        >
          {laid.edges.map(edge => (
            <path
              key={`${edge.from}→${edge.to}`}
              d={edge.d}
              fill="none"
              stroke="color-mix(in oklch, white, transparent 84%)"
              strokeWidth={1.5}
            />
          ))}
        </svg>
        {laid.groups.map(group => (
          <GroupFrame
            key={group.group.id}
            group={group}
            onStep={running?.get(group.group.id) ?? NOT_RUNNING}
            inStage={framesInStage.has(group.group.id)}
          />
        ))}
        {laid.steps.map(step => (
          <StepButton
            key={step.node.key}
            step={step}
            onStep={running?.get(step.node.key) ?? NOT_RUNNING}
            onOpen={() => {
              void navigate(
                factoryPath(
                  projectId,
                  `/steps/${encodeURIComponent(workflow)}/${encodeURIComponent(step.node.key)}`
                ),
                { state: { fromStage: stageId } satisfies StepPageState }
              );
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** The groups that hold, at any depth, a step of the stage drawing the graph. */
function groupsHoldingStageSteps(graph: StepGraphData): Set<string> {
  const parents = new Map(graph.groups.map(group => [group.id, group.parent]));
  const held = new Set<string>();
  for (const node of graph.nodes) {
    if (!node.inStage) continue;
    for (let id = node.group; id !== null; id = parents.get(id) ?? null) held.add(id);
  }
  return held;
}

function GroupFrame({
  group,
  onStep,
  inStage,
}: {
  group: LaidOutGroup;
  onStep: readonly ItemOnStep[];
  /** Whether the frame holds a step of this stage; its label dims when it does not. */
  inStage: boolean;
}): ReactElement {
  const loop = group.group.kind === 'loop';
  // Only a loop is ever the running step: between its bodies, the deepest step is the loop.
  const glows = loop && onStep.length > 0;
  return (
    <div
      data-running={glows ? '' : undefined}
      title={glows ? runningFor(onStep) : undefined}
      className={`absolute rounded-console-12 border ${
        loop ? 'border-border-bright' : 'border-dashed border-border-bright'
      }`}
      style={{
        left: group.x,
        top: group.y,
        width: group.width,
        height: group.height,
        ...(glows ? { borderColor: RUNNING_GLOW.borderColor } : {}),
      }}
    >
      <div
        // A label wider than a narrow frame runs past its edge on its backing rather than cut
        // off the condition, which must read without hovering.
        className={`relative ml-1.5 mt-1 inline-flex items-baseline gap-1.5 whitespace-nowrap rounded bg-surface px-1 text-console-11 ${
          inStage || glows ? '' : 'opacity-50'
        }`}
        title={group.group.when === null ? undefined : `Runs when ${group.group.when}`}
      >
        {loop ? (
          <>
            <span className="shrink-0 whitespace-nowrap font-medium text-text-secondary">
              up to {String(group.group.maxRounds ?? 1)} rounds
            </span>
            <span className="shrink-0 text-text-tertiary" title={group.group.id}>
              {group.group.label}
            </span>
            {group.group.condition === null ? null : (
              <span className="font-medium text-text-primary">{group.group.condition}</span>
            )}
          </>
        ) : (
          <>
            <span className="font-mono text-text-secondary">{group.group.label}</span>
            <span className="text-text-tertiary">included</span>
          </>
        )}
      </div>
    </div>
  );
}

function kindGlyph(kind: StepGraphNode['kind']): string {
  switch (kind) {
    case 'agent':
      return '·';
    case 'bash':
      return '$';
    case 'script':
      return '⧉';
    case 'loop':
      return '↻';
    case 'approval':
      return '◈';
    case 'wait':
      return '◷';
    case 'other':
      return '◇';
  }
}

function StepButton({
  step,
  onStep,
  onOpen,
}: {
  step: LaidOutStep;
  onStep: readonly ItemOnStep[];
  onOpen: () => void;
}): ReactElement {
  const { node } = step;
  const glows = onStep.length > 0;
  // The opened stage's steps stand out; another stage's step recedes, unless it runs now.
  const lit = node.inStage || glows;
  // The name in full, as the box may cut it, then the engine id.
  const title = [
    engineIdTitle(node.label, node.key),
    // The box may cut its condition line too; the worded condition, then the expression.
    ...(node.condition === null ? [] : [node.condition]),
    ...(node.when === null ? [] : [`Runs when ${node.when}`]),
    ...(glows ? [runningFor(onStep)] : []),
  ].join('\n');
  return (
    <button
      type="button"
      onClick={onOpen}
      data-running={glows ? '' : undefined}
      title={title}
      data-in-stage={node.inStage ? '' : undefined}
      className={`absolute flex items-center gap-2.5 overflow-hidden rounded-lg border bg-surface-elevated px-3.5 text-left transition-colors hover:brightness-110 ${
        lit ? 'border-border-bright' : 'border-border opacity-35'
      }`}
      style={{
        left: step.x,
        top: step.y,
        width: step.width,
        height: step.height,
        ...(glows ? RUNNING_GLOW : {}),
      }}
    >
      <span
        aria-hidden
        className="shrink-0 font-mono text-console-15 font-bold leading-none text-text-tertiary"
      >
        {kindGlyph(node.kind)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={`truncate text-console-13 font-semibold ${
            lit ? 'text-text-primary' : 'text-text-tertiary'
          }`}
        >
          {node.label}
        </span>
        {node.condition === null ? null : (
          <span className="truncate text-console-11 text-text-secondary">{node.condition}</span>
        )}
      </span>
    </button>
  );
}

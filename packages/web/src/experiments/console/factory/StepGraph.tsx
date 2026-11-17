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
import type { StepPageState } from './lib/stage-steps';
import { factoryPath } from './lib/views';

interface StepGraphProps {
  projectId: string;
  /** The workflow as the factory view names it; the step page's route takes this name. */
  workflow: string;
  /** The stage drawing this graph; the step page leads back to it. */
  stageId: string;
  graph: StepGraphData;
}

/**
 * One workflow's steps, top to bottom (RunGraphPanel's canvas, nodes and connectors), with
 * each loop group framed and labelled with its rounds and each included workflow framed in
 * dashes. A step another stage works is dimmed. Clicking a step opens its page.
 */
export function StepGraph({ projectId, workflow, stageId, graph }: StepGraphProps): ReactElement {
  const navigate = useNavigate();
  const laid = useMemo(() => layoutStepGraph(graph), [graph]);
  const size: CSSProperties = {
    width: Math.max(laid.width, STEP_W + STEP_GRAPH_PADDING * 2),
    height: Math.max(laid.height, STEP_H + STEP_GRAPH_PADDING * 2),
  };
  return (
    <div
      className="flex w-full justify-center overflow-auto rounded-console-12 border border-border p-4"
      // Dotted canvas, as RunGraphPanel draws it.
      style={{
        background:
          'radial-gradient(circle at 1px 1px, color-mix(in oklch, white, transparent 95%) 1px, transparent 0) 0 0 / 26px 26px',
      }}
    >
      <div className="relative shrink-0" style={size}>
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
          <GroupFrame key={group.group.id} group={group} />
        ))}
        {laid.steps.map(step => (
          <StepButton
            key={step.node.key}
            step={step}
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

function GroupFrame({ group }: { group: LaidOutGroup }): ReactElement {
  const loop = group.group.kind === 'loop';
  return (
    <div
      className={`absolute rounded-console-12 border ${
        loop ? 'border-border-bright' : 'border-dashed border-border-bright'
      }`}
      style={{ left: group.x, top: group.y, width: group.width, height: group.height }}
    >
      <div
        className="ml-1.5 mt-1 inline-flex max-w-full items-baseline gap-1.5 rounded bg-surface px-1 text-console-11"
        title={group.group.when === null ? undefined : `Runs when ${group.group.when}`}
      >
        {loop ? (
          <>
            <span className="shrink-0 whitespace-nowrap font-medium text-text-secondary">
              up to {String(group.group.maxRounds ?? 1)} rounds
            </span>
            <span className="shrink-0 font-mono text-text-tertiary">{group.group.label}</span>
            {group.group.condition === null ? null : (
              <span className="min-w-0 truncate font-mono text-text-secondary">
                {group.group.condition}
              </span>
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

function StepButton({ step, onOpen }: { step: LaidOutStep; onOpen: () => void }): ReactElement {
  const { node } = step;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={node.when === null ? node.key : `${node.key}\nRuns when ${node.when}`}
      className={`absolute flex items-center gap-2.5 overflow-hidden rounded-lg border border-border-bright bg-surface-elevated px-3.5 text-left transition-colors hover:brightness-110 ${
        node.inStage ? '' : 'opacity-60'
      }`}
      style={{ left: step.x, top: step.y, width: step.width, height: step.height }}
    >
      <span
        aria-hidden
        className="shrink-0 font-mono text-console-15 font-bold leading-none text-text-tertiary"
      >
        {kindGlyph(node.kind)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-mono text-console-13 font-semibold text-text-primary">
          {node.label}
        </span>
        {node.condition === null ? null : (
          <span className="truncate font-mono text-console-11 text-text-secondary">
            {node.condition}
          </span>
        )}
      </span>
    </button>
  );
}

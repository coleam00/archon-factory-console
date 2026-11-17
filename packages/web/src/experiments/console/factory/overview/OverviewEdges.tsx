import type { ReactElement } from 'react';
import type { Box } from '../lib/map-layout';
import type { OverviewEdgePath } from '../lib/overview-layout';

const LINE = 'color-mix(in oklch, white, transparent 55%)';
const LANE = 'var(--node-approval)';

/** How each kind of edge is drawn, in world px: feeds solid, calls dotted, the lane dashed and coloured. */
const STYLE: Record<OverviewEdgePath['kind'], { stroke: string; width: number; dash?: string }> = {
  feeds: { stroke: LINE, width: 3 },
  calls: { stroke: LINE, width: 2.5, dash: '3 7' },
  'loops-back': { stroke: LANE, width: 3, dash: '12 9' },
};

const d = (edge: OverviewEdgePath): string =>
  edge.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toString()},${p.y.toString()}`).join(' ');

/** Where a label's text sits: above a row edge, beside a column edge, on the lane. */
function labelPlace(edge: OverviewEdgePath): { x: number; y: number; anchor: 'middle' | 'start' } {
  if (edge.labelSide === 'above')
    return { x: edge.labelAt.x, y: edge.labelAt.y - 16, anchor: 'middle' };
  if (edge.labelSide === 'right')
    return { x: edge.labelAt.x + 12, y: edge.labelAt.y, anchor: 'start' };
  return { x: edge.labelAt.x, y: edge.labelAt.y, anchor: 'middle' };
}

/** A view's edges, under its cards, with an arrowhead at each target. */
export function OverviewEdges({
  edges,
  bounds,
}: {
  edges: readonly OverviewEdgePath[];
  bounds: Box;
}): ReactElement {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute overflow-visible"
      style={{ left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h }}
      viewBox={`${bounds.x.toString()} ${bounds.y.toString()} ${bounds.w.toString()} ${bounds.h.toString()}`}
    >
      <defs>
        {(['line', 'lane'] as const).map(id => (
          <marker
            key={id}
            id={`overview-head-${id}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={id === 'lane' ? LANE : LINE} />
          </marker>
        ))}
      </defs>
      {edges.map(edge => {
        const style = STYLE[edge.kind];
        const place = labelPlace(edge);
        return (
          <g key={`${edge.from}->${edge.to}:${edge.kind}`} data-edge={edge.kind}>
            <path
              d={d(edge)}
              fill="none"
              stroke={style.stroke}
              strokeWidth={style.width}
              strokeDasharray={style.dash}
              strokeLinejoin="round"
              markerEnd={`url(#overview-head-${edge.kind === 'loops-back' ? 'lane' : 'line'})`}
            />
            {edge.label === undefined ? null : (
              <text
                x={place.x}
                y={place.y}
                textAnchor={place.anchor}
                dominantBaseline="middle"
                className="fill-text-secondary text-console-22"
                stroke="var(--surface-inset)"
                strokeWidth={8}
                paintOrder="stroke"
              >
                {edge.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

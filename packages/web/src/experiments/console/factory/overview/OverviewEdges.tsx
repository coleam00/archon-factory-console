import type { ReactElement } from 'react';
import type { Box, Point } from '../lib/map-layout';
import {
  OVERVIEW_SMALL_TEXT,
  type OverviewEdgePath,
  type OverviewFan,
} from '../lib/overview-layout';

const LINE = 'color-mix(in oklch, white, transparent 55%)';
const LANE = 'var(--node-approval)';

/** How each kind of edge is drawn, in world px: feeds solid, calls dotted, the lane dashed and coloured. */
const STYLE: Record<OverviewEdgePath['kind'], { stroke: string; width: number; dash?: string }> = {
  feeds: { stroke: LINE, width: 3 },
  calls: { stroke: LINE, width: 2.5, dash: '3 7' },
  'loops-back': { stroke: LANE, width: 3, dash: '12 9' },
};

/** A stub's head, in stroke widths: smaller than a line's, so it does not swallow the short stub. */
const STUB_HEAD = 3.5;

const d = (points: readonly Point[]): string =>
  points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toString()},${p.y.toString()}`).join(' ');

/** Where a label's text sits: above a row edge, beside a column edge, on the lane. */
function labelPlace(edge: OverviewEdgePath): { x: number; y: number; anchor: 'middle' | 'start' } {
  if (edge.labelSide === 'above')
    return { x: edge.labelAt.x, y: edge.labelAt.y - 16, anchor: 'middle' };
  if (edge.labelSide === 'right')
    return { x: edge.labelAt.x + 12, y: edge.labelAt.y, anchor: 'start' };
  return { x: edge.labelAt.x, y: edge.labelAt.y, anchor: 'middle' };
}

/**
 * A view's edges and fans, under its cards, with an arrowhead at each target card. An edge into
 * a parallel group ends on the group's bar without one; the bar's stubs carry the heads into
 * each member.
 */
export function OverviewEdges({
  edges,
  fans,
  bounds,
}: {
  edges: readonly OverviewEdgePath[];
  fans: readonly OverviewFan[];
  bounds: Box;
}): ReactElement {
  const fannedIn = new Set(fans.filter(fan => fan.into).map(fan => fan.group));
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute overflow-visible"
      style={{ left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h }}
      viewBox={`${bounds.x.toString()} ${bounds.y.toString()} ${bounds.w.toString()} ${bounds.h.toString()}`}
    >
      <defs>
        {(['line', 'lane', 'stub'] as const).map(id => (
          <marker
            key={id}
            id={`overview-head-${id}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth={id === 'stub' ? STUB_HEAD : 5}
            markerHeight={id === 'stub' ? STUB_HEAD : 5}
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
              d={d(edge.points)}
              fill="none"
              stroke={style.stroke}
              strokeWidth={style.width}
              strokeDasharray={style.dash}
              strokeLinejoin="round"
              markerEnd={
                fannedIn.has(edge.to)
                  ? undefined
                  : `url(#overview-head-${edge.kind === 'loops-back' ? 'lane' : 'line'})`
              }
            />
            {edge.label === undefined ? null : (
              <text
                x={place.x}
                y={place.y}
                textAnchor={place.anchor}
                dominantBaseline="middle"
                className={`fill-text-secondary ${OVERVIEW_SMALL_TEXT}`}
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
      {fans.map(fan => (
        <FanLines key={`${fan.group}:${fan.side}`} fan={fan} />
      ))}
    </svg>
  );
}

/** A fan's bar and its stubs, in its edge's style; into the group, each stub ends in a head. */
function FanLines({ fan }: { fan: OverviewFan }): ReactElement {
  const style = STYLE[fan.kind];
  const stroke = {
    fill: 'none',
    stroke: style.stroke,
    strokeWidth: style.width,
    strokeDasharray: style.dash,
  };
  return (
    <g data-fan={`${fan.group}:${fan.side}`}>
      <path d={d(fan.bar)} {...stroke} strokeLinecap="round" />
      {fan.stubs.map(stub => (
        <path
          key={stub.card}
          d={d([stub.from, stub.to])}
          {...stroke}
          markerEnd={fan.into ? 'url(#overview-head-stub)' : undefined}
        />
      ))}
    </g>
  );
}

import type { ReactElement } from 'react';
import type { Box, Point } from '../lib/map-layout';
import {
  OVERVIEW_SMALL_TEXT,
  type OverviewEdgePath,
  type OverviewFan,
} from '../lib/overview-layout';

/*
 * Lines in the Visual standard's rule 4: 1.5 px, 8 px rounded bends, 6 px heads. Forward lines
 * solid and asks dotted, in the tertiary text colour; send-backs dashed in the approval colour;
 * a shadow line in its kind's dash, in the shadow colour (rule 10).
 */
const LINE = 'var(--text-tertiary)';
const BACK = 'var(--node-approval)';
const SHADOW = 'var(--node-opaque)';
const STROKE = 1.5;
const BEND = 8;
const HEAD = 6;
const DASH: Record<OverviewEdgePath['kind'], string | undefined> = {
  feeds: undefined,
  calls: '2 3',
  'loops-back': '6 4',
};

/** The colour a line is drawn in, and the arrowhead marker of that colour. */
function colourOf(edge: {
  kind: OverviewEdgePath['kind'];
  shadow: boolean;
}): 'line' | 'back' | 'shadow' {
  if (edge.shadow) return 'shadow';
  return edge.kind === 'loops-back' ? 'back' : 'line';
}
const COLOURS = { line: LINE, back: BACK, shadow: SHADOW } as const;

/** An orthogonal path with each bend rounded, never by more than half a run. */
function rounded(points: readonly Point[]): string {
  const at = (p: Point): string => `${p.x.toString()},${p.y.toString()}`;
  const first = points[0];
  if (first === undefined) return '';
  let d = `M${at(first)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1] as Point;
    const corner = points[i] as Point;
    const next = points[i + 1] as Point;
    const into = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const out = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(BEND, into / 2, out / 2);
    const toward = (from: Point, len: number): Point => ({
      x: corner.x + ((from.x - corner.x) / len) * r,
      y: corner.y + ((from.y - corner.y) / len) * r,
    });
    d += ` L${at(toward(prev, into))} Q${at(corner)} ${at(toward(next, out))}`;
  }
  const last = points.at(-1) as Point;
  return points.length > 1 ? `${d} L${at(last)}` : d;
}

/**
 * A view's edges and fans, under its cards, with an arrowhead at each target card and each
 * label on a pill set off its line. An edge into a parallel group ends on the group's bar
 * without a head; the bar's stubs carry the heads into each member.
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
        {(Object.keys(COLOURS) as (keyof typeof COLOURS)[]).map(id => (
          <marker
            key={id}
            id={`overview-head-${id}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerUnits="userSpaceOnUse"
            markerWidth={HEAD}
            markerHeight={HEAD}
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={COLOURS[id]} />
          </marker>
        ))}
      </defs>
      {edges.map(edge => (
        <EdgeLine
          key={`${edge.from}->${edge.to}:${edge.kind}`}
          edge={edge}
          head={!fannedIn.has(edge.to)}
        />
      ))}
      {fans.map(fan => (
        <FanLines key={`${fan.group}:${fan.side}`} fan={fan} />
      ))}
      {edges.map(edge =>
        edge.pill === undefined || edge.label === undefined ? null : (
          <EdgePill
            key={`${edge.from}->${edge.to}:${edge.kind}`}
            pill={edge.pill}
            label={edge.label}
            shadow={edge.shadow}
          />
        )
      )}
    </svg>
  );
}

function EdgeLine({ edge, head }: { edge: OverviewEdgePath; head: boolean }): ReactElement {
  const colour = colourOf(edge);
  return (
    <path
      data-edge={edge.kind}
      data-shadow={edge.shadow ? 'true' : undefined}
      d={rounded(edge.points)}
      fill="none"
      stroke={COLOURS[colour]}
      strokeWidth={STROKE}
      strokeDasharray={DASH[edge.kind]}
      markerEnd={head ? `url(#overview-head-${colour})` : undefined}
    />
  );
}

/** The width of a pill's shadow badge, and the badge's own box inside it. */
const BADGE_W = 52;

/** A line's label on a pill; a shadow line's pill ends in a "shadow" badge. */
function EdgePill({
  pill,
  label,
  shadow,
}: {
  pill: Box;
  label: string;
  shadow: boolean;
}): ReactElement {
  const textW = shadow ? pill.w - BADGE_W - 8 : pill.w;
  const cy = pill.y + pill.h / 2;
  return (
    <g data-pill={label} className={OVERVIEW_SMALL_TEXT}>
      <rect
        x={pill.x}
        y={pill.y}
        width={pill.w}
        height={pill.h}
        rx={pill.h / 2}
        fill="var(--surface-inset)"
        stroke="var(--border)"
      />
      <text
        x={pill.x + textW / 2}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--text-secondary)"
      >
        {label}
      </text>
      {shadow ? (
        <g>
          <rect
            x={pill.x + pill.w - BADGE_W - 4}
            y={pill.y + 2}
            width={BADGE_W}
            height={pill.h - 4}
            rx={(pill.h - 4) / 2}
            fill="none"
            stroke={SHADOW}
            strokeDasharray="3 2"
          />
          <text
            x={pill.x + pill.w - BADGE_W / 2 - 4}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fill={SHADOW}
          >
            shadow
          </text>
        </g>
      ) : null}
    </g>
  );
}

/** A fan's bar and its stubs, in its edge's style; into the group, each stub ends in a head. */
function FanLines({ fan }: { fan: OverviewFan }): ReactElement {
  const stroke = {
    fill: 'none',
    stroke: LINE,
    strokeWidth: STROKE,
    strokeDasharray: DASH[fan.kind],
  };
  return (
    <g data-fan={`${fan.group}:${fan.side}`}>
      <path d={rounded(fan.bar)} {...stroke} strokeLinecap="round" />
      {fan.stubs.map(stub => (
        <path
          key={stub.card}
          d={rounded([stub.from, stub.to])}
          {...stroke}
          markerEnd={fan.into ? 'url(#overview-head-line)' : undefined}
        />
      ))}
    </g>
  );
}

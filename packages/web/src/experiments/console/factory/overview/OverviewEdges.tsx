import type { ReactElement } from 'react';
import {
  BACK,
  BACK_DASH,
  HeadMarker,
  LINE,
  LinePill,
  rounded,
  SHADOW,
  STROKE,
} from '../canvas-lines';
import type { Box } from '../lib/map-layout';
import type { OverviewEdgePath, OverviewFan } from '../lib/overview-layout';

/* Lines in the Visual standard's rule 4 (`canvas-lines.tsx`); asks dotted. */

const DASH: Record<OverviewEdgePath['kind'], string | undefined> = {
  feeds: undefined,
  calls: '2 3',
  'loops-back': BACK_DASH,
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
          <HeadMarker key={id} id={`overview-head-${id}`} colour={COLOURS[id]} />
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
          <LinePill
            key={`${edge.from}->${edge.to}:${edge.kind}`}
            pill={edge.pill}
            lines={[edge.label]}
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
      d={rounded(edge.points)}
      fill="none"
      stroke={COLOURS[colour]}
      strokeWidth={STROKE}
      strokeDasharray={DASH[edge.kind]}
      markerEnd={head ? `url(#overview-head-${colour})` : undefined}
    />
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

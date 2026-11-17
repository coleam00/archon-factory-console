import type { ReactElement } from 'react';
import type { MapLayout, Point } from '../lib/map-layout';
import { LINE_H } from '../lib/map-sizes';

/** The colour of every line on the map; the legend draws its swatches in it. */
export const LINE = 'color-mix(in oklch, white, transparent 70%)';

/** A label with a halo in the frame's colour, readable where it crosses a line. */
function Label({ at, children }: { at: Point; children: string }): ReactElement {
  return (
    <text
      x={at.x}
      y={at.y}
      textAnchor="middle"
      dominantBaseline="middle"
      className="fill-text-secondary text-console-15"
      stroke="var(--surface-inset)"
      strokeWidth={4}
      paintOrder="stroke"
    >
      {children}
    </text>
  );
}

/**
 * An arrow's label. Between two cards of a row the gap is narrow, so several outcomes stack
 * one per line, the last on the line's own label point; in a lane there is room for one line.
 */
function ArrowLabel({
  arrow,
}: {
  arrow: { label: string | undefined; labelAt: Point; lane?: number | undefined };
}): ReactElement {
  const parts = arrow.label?.split(', ') ?? [];
  if (arrow.lane !== undefined || parts.length < 2)
    return <Label at={arrow.labelAt}>{arrow.label ?? ''}</Label>;
  return (
    <>
      {parts.map((part, index) => (
        <Label
          key={part}
          at={{ x: arrow.labelAt.x, y: arrow.labelAt.y - LINE_H * (parts.length - 1 - index) }}
        >
          {index < parts.length - 1 ? `${part},` : part}
        </Label>
      ))}
    </>
  );
}

/** One line on the map, ending in an arrowhead. */
function ArrowLine({ d }: { d: string }): ReactElement {
  return (
    <path d={d} fill="none" stroke={LINE} strokeWidth={1.5} markerEnd="url(#factory-map-head)" />
  );
}

/**
 * The map's forward hand-offs, each labelled; and the feedback lane, one path per send-back
 * and one label per target.
 */
export function MapArrows({
  layout,
}: {
  layout: Pick<MapLayout, 'arrows' | 'feedback' | 'bounds'>;
}): ReactElement {
  const { arrows, feedback, bounds } = layout;
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute overflow-visible"
      style={{ left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h }}
      viewBox={`${bounds.x.toString()} ${bounds.y.toString()} ${bounds.w.toString()} ${bounds.h.toString()}`}
    >
      <defs>
        <marker
          id="factory-map-head"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" fill={LINE} />
        </marker>
      </defs>
      {arrows.map(arrow => (
        <g key={arrow.id} data-arrow={arrow.id}>
          <ArrowLine d={arrow.d} />
          {arrow.label === undefined ? null : <ArrowLabel arrow={arrow} />}
        </g>
      ))}
      {feedback.paths.map(path => (
        <g key={path.id} data-arrow={path.id} data-lane="feedback">
          <ArrowLine d={path.d} />
        </g>
      ))}
      {feedback.labels.map(label => (
        <g key={label.stage} data-lane-label={label.stage}>
          {label.lines.map(line => (
            <Label key={line.text} at={line.at}>
              {line.text}
            </Label>
          ))}
        </g>
      ))}
    </svg>
  );
}

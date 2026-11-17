import type { ReactElement } from 'react';
import type { ArrowPath, Box } from '../lib/map-layout';

const LINE = 'color-mix(in oklch, white, transparent 70%)';

/** The declared hand-offs: forward arrows solid, returns dashed in their lanes below. */
export function MapArrows({
  arrows,
  bounds,
}: {
  arrows: readonly ArrowPath[];
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
        <g key={`${arrow.from}->${arrow.to}`}>
          <path
            d={arrow.d}
            fill="none"
            stroke={LINE}
            strokeWidth={1.5}
            strokeDasharray={arrow.back ? '5 4' : undefined}
            markerEnd="url(#factory-map-head)"
          />
          {arrow.label === undefined ? null : (
            <text
              x={arrow.labelAt.x}
              y={arrow.labelAt.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-text-secondary text-console-13"
              // A halo in the frame's colour keeps a label readable where it crosses a line.
              stroke="var(--surface-inset)"
              strokeWidth={4}
              paintOrder="stroke"
            >
              {arrow.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

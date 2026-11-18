import type { ReactElement } from 'react';
import { BACK, BACK_DASH, HeadMarker, LINE, LinePill, rounded, STROKE } from '../canvas-lines';
import type { MapLayout } from '../lib/map-layout';

/**
 * The map's lines in the Visual standard's rule 4: each forward hand-off solid, its label on a
 * pill above it; the feedback lane dashed in the send-back colour, each of its pieces drawn
 * once, and one pill per stage it returns to.
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
        <HeadMarker id="factory-map-head" colour={LINE} />
        <HeadMarker id="factory-map-head-back" colour={BACK} />
      </defs>
      {arrows.map(arrow => (
        <g key={arrow.id} data-arrow={arrow.id}>
          <path
            d={arrow.d}
            fill="none"
            stroke={LINE}
            strokeWidth={STROKE}
            markerEnd="url(#factory-map-head)"
          />
          {arrow.pill === undefined ? null : <LinePill pill={arrow.pill} lines={arrow.lines} />}
        </g>
      ))}
      {feedback.strokes.map(stroke => (
        <path
          key={stroke.points.map(p => `${p.x.toString()},${p.y.toString()}`).join(' ')}
          data-lane="feedback"
          d={rounded(stroke.points)}
          fill="none"
          stroke={BACK}
          strokeWidth={STROKE}
          strokeDasharray={BACK_DASH}
          markerEnd={stroke.head ? 'url(#factory-map-head-back)' : undefined}
        />
      ))}
      {feedback.pills.map(pill => (
        <g key={pill.stage} data-lane-pill={pill.stage}>
          <LinePill pill={pill.box} lines={[pill.text]} />
        </g>
      ))}
    </svg>
  );
}

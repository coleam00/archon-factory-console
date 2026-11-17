import type { ReactElement } from 'react';
import type { LaneLabel } from '../lib/map-feedback-lane';
import type { GraphArrowStyle } from '../lib/map-graph';
import type { MapLayout, Point } from '../lib/map-layout';
import { LINE_H } from '../lib/map-sizes';

const LINE = 'color-mix(in oklch, white, transparent 70%)';
const PROBLEM = 'var(--error)';

/** Solid when the install starts it; dashed when only the pack declares it; error when refused. */
export const ARROW_STROKE: Record<GraphArrowStyle, { stroke: string; dash: string | undefined }> = {
  solid: { stroke: LINE, dash: undefined },
  declared: { stroke: LINE, dash: '5 4' },
  problem: { stroke: PROBLEM, dash: '5 4' },
};

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

/**
 * The text colour of a label part in each style: the feedback lane draws send-backs that
 * overlap as one line, so its label says which outcome the install starts (as other labels),
 * which only the pack declares (fainter), and which it refuses (error).
 */
const PART_FILL: Record<GraphArrowStyle, string> = {
  solid: 'fill-text-secondary',
  declared: 'fill-text-tertiary',
  problem: 'fill-error',
};

/** One target's label in the feedback lane, each outcome in its send-back's style. */
function LaneLabelText({ label }: { label: LaneLabel }): ReactElement {
  return (
    <g data-lane-label={label.stage}>
      {label.lines.map((line, index) => (
        <text
          key={line.parts.map(part => part.text).join(', ')}
          x={line.at.x}
          y={line.at.y}
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-console-15"
          stroke="var(--surface-inset)"
          strokeWidth={4}
          paintOrder="stroke"
        >
          {line.parts.map((part, i) => (
            <tspan
              key={`${part.text}:${part.style}`}
              data-style={part.style}
              className={PART_FILL[part.style]}
            >
              {i < line.parts.length - 1 || index < label.lines.length - 1
                ? `${part.text},`
                : part.text}
              {i < line.parts.length - 1 ? ' ' : ''}
            </tspan>
          ))}
        </text>
      ))}
    </g>
  );
}

/** One line on the map in its style, ending in an arrowhead. */
function ArrowLine({ d, style }: { d: string; style: GraphArrowStyle }): ReactElement {
  return (
    <path
      d={d}
      fill="none"
      stroke={ARROW_STROKE[style].stroke}
      strokeWidth={1.5}
      strokeDasharray={ARROW_STROKE[style].dash}
      markerEnd={`url(#factory-map-head-${style === 'problem' ? 'problem' : 'solid'})`}
    />
  );
}

/** The trigger files' problems an arrow the install refuses has, as its hover title. */
function Problems({ problems }: { problems: readonly string[] }): ReactElement | null {
  return problems.length === 0 ? null : (
    <title>{`This install refuses it: ${problems.join('; ')}`}</title>
  );
}

/**
 * The map's forward hand-offs, each in its style and labelled; the feedback lane, one path per
 * send-back and one label per target; and each card's ends, a line off its outer edge to a
 * bar, with the outcomes that end there.
 */
export function MapArrows({
  layout,
}: {
  layout: Pick<MapLayout, 'arrows' | 'feedback' | 'stubs' | 'bounds'>;
}): ReactElement {
  const { arrows, feedback, stubs, bounds } = layout;
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute overflow-visible"
      style={{ left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h }}
      viewBox={`${bounds.x.toString()} ${bounds.y.toString()} ${bounds.w.toString()} ${bounds.h.toString()}`}
    >
      <defs>
        {(['solid', 'problem'] as const).map(style => (
          <marker
            key={style}
            id={`factory-map-head-${style}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={ARROW_STROKE[style].stroke} />
          </marker>
        ))}
      </defs>
      {arrows.map(arrow => (
        <g key={arrow.id} data-arrow={arrow.id} data-style={arrow.style}>
          <Problems problems={arrow.problems} />
          <ArrowLine d={arrow.d} style={arrow.style} />
          {arrow.label === undefined ? null : <ArrowLabel arrow={arrow} />}
        </g>
      ))}
      {feedback.paths.map(path => (
        <g key={path.id} data-arrow={path.id} data-style={path.style} data-lane="feedback">
          <Problems problems={path.problems} />
          <ArrowLine d={path.d} style={path.style} />
        </g>
      ))}
      {feedback.labels.map(label => (
        <LaneLabelText key={label.stage} label={label} />
      ))}
      {stubs.map(stub => (
        <g key={`ends:${stub.stage}`} data-ends={stub.stage}>
          <path d={stub.d} fill="none" stroke={LINE} strokeWidth={1.5} />
          {stub.lines.map(line => (
            <Label key={line.text} at={line.at}>
              {line.text}
            </Label>
          ))}
        </g>
      ))}
    </svg>
  );
}

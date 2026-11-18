/**
 * The Visual standard's lines (rule 4), shared by the canvases that draw them: the live map
 * and How it works. 1.5 px, 8 px rounded bends, 6 px heads; forward lines solid in the
 * tertiary text colour, send-backs dashed `6 4` in the approval colour, a shadow line in the
 * shadow colour (rule 10); and each label on a pill set off its line.
 */
import type { ReactElement } from 'react';
import type { Box, Point } from './lib/map-layout';
import { PILL_LINE } from './lib/map-sizes';
import {
  OVERVIEW_SMALL_TEXT,
  PILL_BADGE_ROOM,
  PILL_BADGE_W as BADGE_W,
} from './lib/overview-layout';

export const LINE = 'var(--text-tertiary)';
export const BACK = 'var(--node-approval)';
export const SHADOW = 'var(--node-opaque)';
export const STROKE = 1.5;
export const HEAD = 6;
/** A send-back's dash. */
export const BACK_DASH = '6 4';
const BEND = 8;

/** An orthogonal path with each bend rounded, never by more than half a run. */
export function rounded(points: readonly Point[]): string {
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

/** A 6 px filled arrowhead in `colour`, for a line's `markerEnd="url(#<id>)"`. */
export function HeadMarker({ id, colour }: { id: string; colour: string }): ReactElement {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="9"
      refY="5"
      markerUnits="userSpaceOnUse"
      markerWidth={HEAD}
      markerHeight={HEAD}
      orient="auto-start-reverse"
    >
      <path d="M0,0 L10,5 L0,10 z" fill={colour} />
    </marker>
  );
}

/**
 * A line's label on a pill: one text line per entry of `lines`, `PILL_LINE` apart, so several
 * outcomes stack in one narrow pill. A shadow line's pill ends in a "shadow" badge.
 */
export function LinePill({
  pill,
  lines,
  shadow = false,
}: {
  pill: Box;
  lines: readonly string[];
  shadow?: boolean;
}): ReactElement {
  const textW = shadow ? pill.w - PILL_BADGE_ROOM : pill.w;
  const first = pill.y + pill.h / 2 - (PILL_LINE * (lines.length - 1)) / 2;
  return (
    <g data-pill={lines.join(' ')} className={OVERVIEW_SMALL_TEXT}>
      <rect
        x={pill.x}
        y={pill.y}
        width={pill.w}
        height={pill.h}
        rx={Math.min(pill.h, pill.w) / 2}
        fill="var(--surface-inset)"
        stroke="var(--border)"
      />
      {lines.map((line, index) => (
        <text
          key={line}
          x={pill.x + textW / 2}
          y={first + PILL_LINE * index}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--text-secondary)"
        >
          {line}
        </text>
      ))}
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
            y={pill.y + pill.h / 2}
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

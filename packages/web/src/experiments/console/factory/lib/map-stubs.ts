/**
 * What the map draws on one card's outer edge rather than between two cards: an arrow back
 * into the same card (a stage whose answered asks start it again), and the outcomes that end
 * there, starting nothing. The outer edge is the top for the first row and the bottom for any
 * other, away from the lanes between rows (`map-layout.ts`).
 */
import type { Box, Point } from './map-layout';

/** How far a self-loop rises off its edge. */
const LOOP_H = 40;
/** How far an end's line runs off its edge before its bar. */
const STUB_LEN = 24;
/** Half the bar's width. */
const BAR_HALF = 8;
/** One line of an end's label at the map's label size. */
export const LINE_H = 18;
/** The longest line an end's label wraps to, in characters, so it stays about a card wide. */
const WRAP = 24;

export interface LoopPath {
  id: string;
  stage: string;
  label: string;
  /** The SVG path, ending where the arrowhead points. */
  d: string;
  labelAt: Point;
  /** The box the loop and its label take, for the map's bounds. */
  extent: Box;
}

export interface StubPath {
  stage: string;
  /** The line out of the card and the bar it ends in. */
  d: string;
  /** The label's lines in reading order, top to bottom, each with where its centre goes. */
  lines: { text: string; at: Point }[];
  extent: Box;
}

/** `text` split at its commas into lines of at most `WRAP` characters where it can be. */
function wrap(text: string): string[] {
  const lines: string[] = [];
  for (const part of text.split(', ')) {
    const last = lines.at(-1);
    if (last !== undefined && last.length + part.length + 2 <= WRAP)
      lines[lines.length - 1] = `${last}, ${part}`;
    else lines.push(part);
  }
  return lines.map((line, index) => (index < lines.length - 1 ? `${line},` : line));
}

/** The y of a card's outer edge and which way is out from it. */
function outerEdge(box: Box, row: number): { y: number; out: -1 | 1 } {
  return row === 1 ? { y: box.y, out: -1 } : { y: box.y + box.h, out: 1 };
}

/** An arrow leaving a card's outer edge and coming back into it, labelled beyond its arc. */
export function loopPath(
  id: string,
  stage: string,
  label: string,
  box: Box,
  row: number
): LoopPath {
  const { y, out } = outerEdge(box, row);
  const x1 = box.x + box.w * 0.25;
  const x2 = box.x + box.w * 0.55;
  const peak = y + out * LOOP_H;
  const labelAt = { x: (x1 + x2) / 2, y: peak + out * 6 };
  return {
    id,
    stage,
    label,
    d: `M${x1},${y} C${x1},${peak} ${x2},${peak} ${x2},${y}`,
    labelAt,
    extent: {
      x: box.x,
      y: Math.min(y, labelAt.y - LINE_H / 2),
      w: box.w,
      h: Math.abs(labelAt.y - y) + LINE_H / 2,
    },
  };
}

/** A line off a card's outer edge ending in a bar, with the outcomes that end there beyond it. */
export function stubPath(stage: string, label: string, box: Box, row: number): StubPath {
  const { y, out } = outerEdge(box, row);
  const x = box.x + box.w * 0.82;
  const end = y + out * STUB_LEN;
  const lines = wrap(label);
  // The line nearest the bar, then the rest further out; placed so they read top to bottom.
  const near = end + out * (LINE_H / 2 + 4);
  const far = near + out * (LINE_H * (lines.length - 1) + LINE_H / 2);
  const top = Math.min(near, near + out * LINE_H * (lines.length - 1));
  // A label about a card wide, centred on the line.
  const half = Math.max(...lines.map(line => line.length)) * 4.5;
  return {
    stage,
    d: `M${x},${y} V${end} M${x - BAR_HALF},${end} H${x + BAR_HALF}`,
    lines: lines.map((text, index) => ({ text, at: { x, y: top + LINE_H * index } })),
    extent: {
      x: Math.min(box.x, x - half),
      y: Math.min(y, far),
      w: Math.max(box.x + box.w, x + half) - Math.min(box.x, x - half),
      h: Math.abs(far - y),
    },
  };
}

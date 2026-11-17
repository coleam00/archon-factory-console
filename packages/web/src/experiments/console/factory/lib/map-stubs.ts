/**
 * The outcomes that end on a card, starting nothing, drawn on the card's outer edge: a line
 * off the edge ending in a bar, the outcomes beyond it. The outer edge is the top for the
 * first row and the bottom for the second, away from the feedback lane (`map-layout.ts`).
 */
import type { Box, Point } from './map-layout';
import { CHAR_W, LINE_H, WRAP } from './map-sizes';

/** How far an end's line runs off its edge before its bar. */
const STUB_LEN = 24;
/** Half the bar's width. */
const BAR_HALF = 8;

export interface StubPath {
  stage: string;
  /** The line out of the card and the bar it ends in. */
  d: string;
  /** The label's lines in reading order, top to bottom, each with where its centre goes. */
  lines: { text: string; at: Point }[];
  extent: Box;
}

/**
 * `parts` (the outcomes of a label split at its commas) grouped into lines of at most `WRAP`
 * characters, commas included, where they fit; a part longer than that takes a line alone.
 */
export function wrapParts<T>(parts: readonly T[], text: (part: T) => string): T[][] {
  const lines: { parts: T[]; length: number }[] = [];
  for (const part of parts) {
    const last = lines.at(-1);
    const length = text(part).length;
    if (last !== undefined && last.length + length + 2 <= WRAP) {
      last.parts.push(part);
      last.length += length + 2;
    } else lines.push({ parts: [part], length });
  }
  return lines.map(line => line.parts);
}

/** Half the width the longest of `lines` draws at the map's label size. */
export const halfWidth = (lines: readonly string[]): number =>
  (Math.max(0, ...lines.map(line => line.length)) * CHAR_W) / 2;

/** `text` split at its commas into lines, each but the last ending in its comma. */
function wrap(text: string): string[] {
  const lines = wrapParts(text.split(', '), part => part).map(parts => parts.join(', '));
  return lines.map((line, index) => (index < lines.length - 1 ? `${line},` : line));
}

/**
 * A line off a card's outer edge ending in a bar, with the outcomes that end there beyond it.
 * `clear` lengthens the line past lanes drawn on the same edge.
 */
export function stubPath(stage: string, label: string, box: Box, row: number, clear = 0): StubPath {
  const { y, out } = row === 1 ? { y: box.y, out: -1 } : { y: box.y + box.h, out: 1 };
  const x = box.x + box.w * 0.82;
  const end = y + out * (STUB_LEN + clear);
  const lines = wrap(label);
  // The line nearest the bar, then the rest further out; placed so they read top to bottom.
  const near = end + out * (LINE_H / 2 + 4);
  const far = near + out * (LINE_H * (lines.length - 1) + LINE_H / 2);
  const top = Math.min(near, near + out * LINE_H * (lines.length - 1));
  const half = halfWidth(lines);
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

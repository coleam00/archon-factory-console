/**
 * What is wrong with a view as `layoutOverview` draws it, in world px: an edge it could not
 * route, a line touching a card other than its ends or a group holding neither end, or two
 * lines touching. The shipped file's test and the schema conformance test
 * (`scripts/overview-geometry-parity.test.ts`) both judge a drawing by this one check.
 */
import type { Box, Point } from './map-layout';
import { layoutOverview, type OverviewEdgePath } from './overview-layout';
import type { OverviewView } from './overview-nav';

/** Each straight run of an edge, as a box with no width or no height. */
function segments(edge: OverviewEdgePath): Box[] {
  return edge.points.slice(1).map((end, i) => {
    const start = edge.points[i] as Point;
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      w: Math.abs(end.x - start.x),
      h: Math.abs(end.y - start.y),
    };
  });
}

/** Whether two boxes share any point, edges included. */
const meets = (a: Box, b: Box): boolean =>
  a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;

/** Every fault in the drawing of `view`; empty when it is clean. */
export function drawingFaults(view: OverviewView): string[] {
  const layout = layoutOverview(view);
  const faults: string[] = [];
  const drawn = new Set(layout.edges.map(edge => `${edge.from}->${edge.to}:${edge.kind}`));
  for (const edge of view.edges)
    if (!drawn.has(`${edge.from}->${edge.to}:${edge.kind}`))
      faults.push(`${edge.from}->${edge.to} is not drawn`);
  const groupOf = (id: string): string | undefined => view.cards.find(c => c.id === id)?.group;
  const boxes = [...layout.cards, ...layout.groups];
  layout.edges.forEach((edge, i) => {
    const runs = segments(edge);
    const ends = new Set([edge.from, edge.to, groupOf(edge.from), groupOf(edge.to)]);
    for (const [id, box] of boxes)
      if (!ends.has(id) && runs.some(run => meets(run, box)))
        faults.push(`${edge.from}->${edge.to} hits ${id}`);
    for (const other of layout.edges.slice(i + 1))
      if (runs.some(run => segments(other).some(run2 => meets(run, run2))))
        faults.push(`${edge.from}->${edge.to} meets ${other.from}->${other.to}`);
  });
  return faults;
}

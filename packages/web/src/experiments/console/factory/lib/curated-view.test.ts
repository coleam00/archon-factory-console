import { describe, expect, test } from 'bun:test';
import { shippedArrows, shippedFile, shippedGraph, shippedView } from '../curated.test-fixtures';
import { curatedView } from './curated-view';
import { mapArrows } from './graph-structure';
import { layoutMap } from './map-layout';
import { mapColumns } from './map-columns';

const stage = (id: string) => shippedView.stages.find(entry => entry.id === id);
const FLOW = [
  'order',
  'triage',
  'link',
  'split',
  'plan',
  'stage-build',
  'stage-check',
  'stage-host',
  'landgate',
  'land',
  'landed',
  'discoveries',
  'close',
];

describe('the slim file over the b62ec7b graph', () => {
  test('one map stage per in-flow graph stage, in flow order, with its words from the file', () => {
    expect(shippedView.stages.map(entry => [entry.id, entry.workflows])).toEqual(
      FLOW.map(workflow => [workflow, [workflow]])
    );
    expect(stage('stage-build')).toMatchObject({
      label: 'Build',
      short: 'Writes the change and PR',
    });
    const [cut] = stage('split')?.drilldown?.phases[0]?.cards ?? [];
    expect(cut?.covers).toEqual([{ workflow: 'split', steps: ['cut'] }]);
  });

  test('columns are the groups with their stages in flow order, then the merged stage alone', () => {
    expect(
      mapColumns(shippedView).map(column => [column.label, column.stages, column.tone])
    ).toEqual([
      ['Intake', ['order', 'triage', 'link', 'split'], 'intake'],
      ['Plan and build', ['plan', 'stage-build'], 'build'],
      ['Checks', ['stage-check', 'stage-host'], 'check'],
      ['Landing', ['landgate', 'land', 'discoveries', 'close'], 'land'],
      ['Merged', ['landed'], 'merged'],
    ]);
    expect(shippedView.landed.stage).toBe('landed');
  });

  test('with no groups, every in-flow stage is a column, the merged stage last', () => {
    const view = curatedView(shippedFile, { ...shippedGraph, groups: [] });
    expect(view.columns.map(column => column.stages)).toEqual([
      ...FLOW.filter(id => id !== 'landed').map(id => [id]),
      ['landed'],
    ]);
  });

  test('a file that names no merged stage leaves the last in-flow stage there', () => {
    const { merged: _named, ...file } = shippedFile;
    const view = curatedView(file, shippedGraph);
    expect([view.landed.stage, view.columns.at(-1)?.stages]).toEqual(['close', ['close']]);
  });
});

describe("the map's arrows over the b62ec7b graph", () => {
  const label = (from: string, to: string) =>
    shippedArrows.find(arrow => arrow.from === from && arrow.to === to)?.label;

  test('each pair is labelled with the outcome and answer values its arrows carry', () => {
    expect(label('triage', 'link')).toBe('build, narrow');
    expect(label('stage-build', 'close')).toBe('drop, reshape');
    expect(label('stage-check', 'stage-build')).toBe('return, send-back, one-more-round');
    expect(label('land', 'landed')).toBe('landed');
    expect(label('plan', 'plan')).toBe('answered');
    expect(label('link', 'link')).toBe('asked');
  });

  test('an arrow over a depends_on link is left out', () => {
    expect(label('close', 'link')).toBeUndefined();
    expect(label('land', 'link')).toBeUndefined();
  });

  test('an arrow backward in flow is a send-back in the lane; a forward one is a hand-off', () => {
    const layout = layoutMap(shippedView, mapArrows(shippedView, shippedGraph));
    expect(layout.feedback.paths).toContainEqual(
      expect.objectContaining({ to: 'stage-build', label: 'return, send-back, one-more-round' })
    );
    expect(layout.arrows.map(arrow => [arrow.from, arrow.to])).toContainEqual([
      'plan-and-build',
      'checks',
    ]);
    expect(layout.arrows.find(arrow => arrow.to === 'landed')?.outcomes).toEqual(['landed']);
  });
});

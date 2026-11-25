import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { trackTempRoots } from '@archon/paths/test-utils';
import type { PackGraph } from '../packages/workflows/src/pack-graph';
import { factoryViewFileSchema } from '../packages/workflows/src/schemas/factory-view';
import { type GraphSource, runCheck } from './check-factory-view';

const track = trackTempRoots();
const shipped = resolve(
  import.meta.dir,
  '..',
  'docs',
  'factory-console',
  'pack-view',
  'factory-view.json'
);

/** A graph with stages `a` and `b`, no arrows, both in flow. */
const graph = {
  pack: 'p',
  loaded: [],
  otherCopies: [],
  stages: ['a', 'b'].map(workflow => ({
    name: workflow,
    workflow,
    entry: false,
    roles: [],
    inFlow: true,
    returns: null,
    outcome: null,
    asks: false,
    waits: false,
    nodes: [],
  })),
  entries: [],
  document: null,
  metricViews: null,
  groups: [],
  capacity: [],
  settings: [],
  settingsFile: { path: '', problems: [] },
  arrows: [],
  fanOutBlocks: [],
  discoveryErrors: [],
} satisfies PackGraph;
const source: GraphSource = () => ({ graph });

/** A view file in a temp folder whose cards hold `workflows`. */
function viewFile(workflows: string[][]): string {
  const view = {
    version: 1,
    title: 'P',
    summary: 'P.',
    stages: workflows.map((names, i) => ({
      id: `c${String(i)}`,
      label: 'C',
      blurb: 'C.',
      workflows: names,
    })),
    howItWorks: {
      title: 'P',
      caption: 'P.',
      root: 'top',
      views: {
        top: {
          cards: ['x', 'y'].map((id, i) => ({
            id,
            title: id,
            text: id,
            icon: 'list',
            kind: 'stage',
            col: i + 1,
            row: 1,
          })),
          edges: [
            { from: 'x', to: 'y', kind: 'feeds' },
            { from: 'y', to: 'x', kind: 'loops-back' },
          ],
        },
      },
    },
  };
  const path = join(track(mkdtempSync(join(tmpdir(), 'factory-view-check-'))), 'factory-view.json');
  writeFileSync(path, JSON.stringify(view));
  return path;
}

describe('check:factory-view', () => {
  test('an unknown stage fails', () => {
    const report = runCheck('pack', viewFile([['a', 'zz'], ['b']]), source);
    expect(report.code).toBe(1);
    expect(report.lines.some(l => l.includes('[error]') && l.includes('"zz"'))).toBe(true);
  });

  test('an unplaced stage warns and passes', () => {
    const report = runCheck('pack', viewFile([['a']]), source);
    expect(report.code).toBe(0);
    expect(report.lines.some(l => l.includes('[warning]') && l.includes('"b" is unplaced'))).toBe(
      true
    );
  });

  test('a missing file fails', () => {
    expect(runCheck('pack', join(tmpdir(), 'no-such-factory-view.json'), source).code).toBe(1);
  });

  test('the shipped view file validates', () => {
    expect(factoryViewFileSchema.safeParse(JSON.parse(readFileSync(shipped, 'utf8'))).success).toBe(
      true
    );
  });
});

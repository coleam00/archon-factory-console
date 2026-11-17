import { describe, expect, test } from 'bun:test';
import type { PackGraph } from '../../skills/packs';
import { shippedListed, shippedView } from '../item-detail.test-fixtures';
import { mapArrowsFromGraph, type GraphArrow } from './map-graph';
import { DECLARED_GRAPH as DECLARED, LIVE_GRAPH as LIVE } from './pack-graph.test-fixtures';

const read = (graph: PackGraph) => mapArrowsFromGraph(shippedView, shippedListed.runNames, graph);
const ends = (arrows: readonly GraphArrow[]) =>
  arrows.map(arrow => `${arrow.from} -> ${arrow.to}: ${arrow.label} (${arrow.style})`);

describe('the live install', () => {
  const graph = read(LIVE);

  test('every arrow between declared stages, from the card its run ends on to where the next starts', () => {
    expect(ends(graph.arrows)).toEqual([
      'order -> triage: ready (solid)',
      'triage -> plan: build, narrow (solid)',
      // plan:planned starts deliver, which begins on Build.
      'plan -> build: planned (solid)',
      // deliver returns from `result`, which the CI and review card names.
      'host -> ready: ready (solid)',
      'plan -> plan: asks answered (solid)',
      'host -> build: asks answered (solid)',
    ]);
  });

  test('a start of a workflow with no card is listed, not drawn', () => {
    expect(graph.offMap).toEqual([
      {
        from: 'host',
        workflow: 'deliver',
        when: 'ready',
        // Without the pack's own run-name prefix, as a person reads it.
        starts: 'discoveries',
      },
    ]);
  });

  test('outcomes that start nothing and leave no ask end on their card; stages with asks have none', () => {
    expect(graph.stubs).toEqual([
      { stage: 'ready', label: 'landed, returned, stop, ask' },
      { stage: 'order', label: 'refused' },
      {
        stage: 'triage',
        label: 'recipe, native, fold, park, deprecate, decline, close',
      },
    ]);
    expect(graph.failedToLoad).toBe(0);
  });
});

describe('a home whose install starts nothing', () => {
  test('the same arrows, each declared, and the same ends: a declared arrow is not an end', () => {
    const graph = read(DECLARED);
    expect(ends(graph.arrows)).toEqual(
      ends(read(LIVE).arrows).map(line => line.replace('(solid)', '(declared)'))
    );
    expect(graph.stubs).toEqual(read(LIVE).stubs);
  });
});

describe('arrows the install refuses, and a graph missing stages', () => {
  test('an active arrow with problems is its own arrow, listing them', () => {
    const broken = structuredClone(LIVE);
    const narrow = broken.arrows.find(
      edge => 'outcome' in edge.from && edge.from.outcome === 'narrow'
    );
    if (narrow?.active !== true) throw new Error('the live graph starts plan after narrow');
    narrow.installed.problems = ['the binding names no item input'];
    const arrows = read(broken).arrows.filter(arrow => arrow.from === 'triage');
    expect(arrows).toEqual([
      { from: 'triage', to: 'plan', label: 'build', style: 'solid', problems: [] },
      {
        from: 'triage',
        to: 'plan',
        label: 'narrow',
        style: 'problem',
        problems: ['the binding names no item input'],
      },
    ]);
  });

  test('workflows that failed to load are counted', () => {
    const partial = {
      ...LIVE,
      discoveryErrors: [{ filename: 'plan.yaml', workflowName: 'plan', error: 'bad' }],
    };
    expect(read(partial).failedToLoad).toBe(1);
  });
});

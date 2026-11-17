import type { PackGraph } from '../../skills/packs';
import live from './fixtures/pack-graph.json';

/**
 * `archon pack graph Wirasm.archon-software-factory --json` for the live factory's install on
 * 2026-11-17, each stage's `nodes` dropped and each trigger file named by its file name only.
 * Every arrow is active.
 */
export const LIVE_GRAPH = live as PackGraph;

/**
 * The same graph as a home with no trigger files reads it (`dev:console`'s): every arrow only
 * declared, and so every outcome starting nothing.
 */
function declaredOnly(graph: PackGraph): PackGraph {
  return {
    ...graph,
    arrows: graph.arrows.map(edge => {
      if (edge.declared === null) throw new Error('every live arrow is one the pack declares');
      return { ...edge, active: false, declared: edge.declared, installed: null };
    }),
    stages: graph.stages.map(stage => ({
      ...stage,
      outcome:
        stage.outcome === null
          ? null
          : {
              ...stage.outcome,
              values: stage.outcome.values.map(value => ({ ...value, startsNothing: true })),
            },
    })),
  };
}

export const DECLARED_GRAPH = declaredOnly(LIVE_GRAPH);

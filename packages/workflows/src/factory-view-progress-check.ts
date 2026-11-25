/**
 * A factory view's progress declarations (`schemas/factory-view-progress.ts`) reconciled with
 * the pack graph. `reconcileFactoryView` runs this with the rest of the view's reconcile.
 *
 * - A declaration's `workflow` is a graph stage, or one the view lists in `retired`; for a graph
 *   stage, a decision point's `node` is one of the stage's step ids and a loop-form rounds
 *   source's `loop` is one of its loop groups. A declaration that fails either is dropped: a
 *   console stops counting it until the file is fixed. A retired workflow's steps cannot be
 *   compared with a graph that lacks them, so they are not checked.
 * - A `retired` entry the graph has is an error, as is a duplicate, and so is a workflow a
 *   `rounds` or `change` list names twice: the file says two things, which no drift causes.
 * - A decision point's `outcome` is checked only as non-empty: the graph declares a stage's
 *   outcome values, not the values each step records.
 * - "Returned" has two owners that must agree: `returns` counts sends-back, and an outcome's
 *   `reads: "returned"` says how the item reads after its run. A stage with either has both. A
 *   file that disagrees as written is an error; where a drop leaves one half alone, that half
 *   is dropped too (an outcome keeps its words and loses only `reads`).
 */
import type { PackGraph } from './pack-graph';
import type { Reconciling } from './factory-view-check';
import type { FactoryView, FactoryViewProblem } from './schemas/factory-view';
import { sourcesOf, type FactoryDecisionPoint } from './schemas/factory-view-progress';

type ProblemPath = FactoryViewProblem['path'];
type GraphStage = PackGraph['stages'][number];

/** `retired` names only workflows the graph lacks, each once. */
function retiredErrors(r: Reconciling): void {
  const seen = new Set<string>();
  r.view.retired?.forEach((name, i) => {
    if (seen.has(name)) r.error(['retired', i], `retires "${name}" twice`);
    seen.add(name);
    if (r.stages.has(name)) r.error(['retired', i], `retires "${name}", which the pack graph has`);
  });
}

/** The stage a declaration names, `retired`, or why it is neither. */
function stageOrRetired(r: Reconciling, workflow: string): GraphStage | 'retired' | string {
  const stage = r.stages.get(workflow);
  if (stage !== undefined) return stage;
  if (r.view.retired?.includes(workflow) === true) return 'retired';
  return `names workflow "${workflow}", which pack "${r.graph.pack}" does not have and the view does not retire`;
}

/** The decision points of `key` whose workflow and node the graph has (or that are retired). */
function reconcilePoints(r: Reconciling, key: 'returns' | 'approves'): void {
  const points = r.view[key];
  if (points === undefined) return;
  const kept = points.filter((point, p) => {
    const stage = stageOrRetired(r, point.workflow);
    if (typeof stage === 'string' && stage !== 'retired') {
      r.drop([key, p, 'workflow'], stage);
      return false;
    }
    if (typeof stage === 'object' && !stage.nodes.some(node => node.id === point.node)) {
      r.drop(
        [key, p, 'node'],
        `names step "${point.node}", which stage "${point.workflow}" does not have`
      );
      return false;
    }
    return true;
  });
  if (kept.length > 0) r.view[key] = kept;
  else delete r.view[key];
}

/** The `rounds` and `change` sources whose workflow (and loop) the graph has. */
function reconcileSources(r: Reconciling): void {
  for (const key of ['rounds', 'change'] as const) {
    const declared = r.view[key];
    const single = declared !== undefined && !Array.isArray(declared);
    const pathOf = (index: number): ProblemPath => (single ? [key] : [key, index]);
    const sources = sourcesOf<{ workflow: string; loop?: string }>(declared);
    const workflows = sources.map(source => source.workflow);
    const kept = sources.filter((source, index) => {
      if (workflows.indexOf(source.workflow) !== index)
        r.error(pathOf(index), `names workflow "${source.workflow}" twice`);
      const stage = stageOrRetired(r, source.workflow);
      if (typeof stage === 'string' && stage !== 'retired') {
        r.drop([...pathOf(index), 'workflow'], stage);
        return false;
      }
      if (
        source.loop !== undefined &&
        typeof stage === 'object' &&
        !stage.nodes.some(node => node.loopGroup === source.loop)
      ) {
        r.drop(
          [...pathOf(index), 'loop'],
          `names loop "${source.loop}", which stage "${source.workflow}" does not have`
        );
        return false;
      }
      return true;
    });
    // The kept sources are the declared ones, so each keeps its own form.
    if (kept.length === 0) delete r.view[key];
    else if (!single) (r.view as Record<typeof key, unknown>)[key] = kept;
  }
}

/** Where `view`'s two owners of "returned" disagree: outcome keys and `returns` workflows. */
function disagreements(
  view: FactoryView,
  stages: ReadonlyMap<string, GraphStage>
): { outcomes: Set<string>; returns: Set<string> } {
  const counted = new Set((view.returns ?? []).map(point => point.workflow));
  const reads = new Set<string>();
  const outcomes = new Set<string>();
  for (const [key, outcome] of Object.entries(view.outcomes ?? {})) {
    if (outcome.reads !== 'returned') continue;
    const stage = key.slice(0, key.lastIndexOf(':'));
    reads.add(stage);
    if (!counted.has(stage)) outcomes.add(key);
  }
  const returns = new Set(
    (view.returns ?? [])
      .map(point => point.workflow)
      .filter(workflow => stages.has(workflow) && !reads.has(workflow))
  );
  return { outcomes, returns };
}

/**
 * Every stage with a `reads: "returned"` outcome has a `returns` point, and the reverse. `file`
 * is the view as written: what disagrees there is an error, and what only a drop made disagree
 * is dropped.
 */
function reconcileReturned(r: Reconciling, file: FactoryView): void {
  const written = disagreements(file, r.stages);
  (file.returns ?? []).forEach((point, p) => {
    if (written.returns.has(point.workflow))
      r.error(
        ['returns', p, 'workflow'],
        `counts a return of stage "${point.workflow}", but none of its outcomes reads "returned"`
      );
  });
  for (const key of written.outcomes)
    r.error(
      ['outcomes', key],
      `reads as returned, but no \`returns\` point of stage "${splitStage(key)}" counts it`
    );
  const now = disagreements(r.view, r.stages);
  for (const key of now.outcomes) {
    const outcome = r.view.outcomes?.[key];
    if (written.outcomes.has(key) || outcome === undefined) continue;
    delete outcome.reads;
    r.drop(
      ['outcomes', key, 'reads'],
      `reads as returned, but no \`returns\` point of stage "${splitStage(key)}" is left to count it`
    );
  }
  const points = r.view.returns ?? [];
  const kept = points.filter(point => {
    if (written.returns.has(point.workflow) || !now.returns.has(point.workflow)) return true;
    r.drop(
      ['returns', (file.returns ?? []).findIndex(entry => samePoint(entry, point)), 'workflow'],
      `counts a return of stage "${point.workflow}", but no outcome left reads "returned"`
    );
    return false;
  });
  if (kept.length > 0) r.view.returns = kept;
  else delete r.view.returns;
}

const splitStage = (key: string): string => key.slice(0, key.lastIndexOf(':'));

const samePoint = (a: FactoryDecisionPoint, b: FactoryDecisionPoint): boolean =>
  a.workflow === b.workflow && a.node === b.node && a.outcome === b.outcome;

/** Reconciles `r.view`'s progress declarations; `file` is the view as written. */
export function reconcileProgress(r: Reconciling, file: FactoryView): void {
  retiredErrors(r);
  reconcilePoints(r, 'returns');
  reconcilePoints(r, 'approves');
  reconcileSources(r);
  reconcileReturned(r, file);
}

/**
 * A pack's factory view (`schemas/factory-view.ts`) reconciled with the pack graph. The view is
 * presentation only, so it may only name what the graph has. A pack changes under its file
 * (a stage renamed, a document without groups), so a name the graph lacks costs only the entry
 * that names it: the entry leaves the served view and the same line reports a `warning` whose
 * message starts `dropped:`. That covers a stage, step, outcome, option, group, `merged` stage,
 * progress workflow or loop the graph lacks, and a How it works edge between stages the graph
 * no longer connects. What drift cannot cause stays an `error`, and a console refuses the file
 * on one: a step two drill-down cards cover, and the progress faults
 * `factory-view-progress-check.ts` keeps. What the graph has and the view leaves out is a
 * `warning` too: an in-flow stage no label names (here or in its workflow's `display:`), and a
 * group with no words. Read time (`packViewOf`) and `bun run check:factory-view` both run this,
 * so the view a console draws and the warnings it lists come from one pass.
 */
import type { PackGraph } from './pack-graph';
import { reconcileProgress } from './factory-view-progress-check';
import { PACK_SHARED_DIRECTORY } from './packaged-workflow';
import {
  FACTORY_VIEW_FILE,
  type FactoryView,
  type FactoryViewProblem,
} from './schemas/factory-view';

/** Where in a pack its factory view is, as `readPackDeclarations` takes it. */
export const FACTORY_VIEW_PATH = `${PACK_SHARED_DIRECTORY}/${FACTORY_VIEW_FILE}`;

type ProblemPath = FactoryViewProblem['path'];
type GraphStage = PackGraph['stages'][number];

/**
 * One reconcile in progress: `view` is the copy being pruned, and `drop` and `error` record what
 * happened at a path of the file as written (so a path names the entry the author wrote).
 */
export interface Reconciling {
  view: FactoryView;
  graph: PackGraph;
  /** Graph stages by `workflow` name, the name the view uses. */
  stages: ReadonlyMap<string, GraphStage>;
  problems: FactoryViewProblem[];
  /** Records that the entry at `path` left the served view, and why. */
  drop(path: ProblemPath, message: string): void;
  /** Records a fault drift cannot cause: a console refuses the file on it. */
  error(path: ProblemPath, message: string): void;
}

/** The graph read for checking: the stage pairs arrows join, by `workflow` name. */
function joinedPairs(graph: PackGraph): ReadonlySet<string> {
  const workflowOf = new Map(graph.stages.map(stage => [stage.name, stage.workflow]));
  const joined = new Set<string>();
  // Arrows name stages by `name` (`owner/name:workflow` when installed). Every arrow counts,
  // active or only declared: the view draws the pack as designed.
  for (const arrow of graph.arrows) {
    const from = workflowOf.get(arrow.from.stage);
    const to = workflowOf.get(arrow.to);
    if (from !== undefined && to !== undefined) joined.add(pairKey(from, to));
  }
  return joined;
}

const pairKey = (from: string, to: string): string => `${from}\0${to}`;

const splitKey = (key: string): { stage: string; name: string } => {
  const at = key.lastIndexOf(':');
  return { stage: key.slice(0, at), name: key.slice(at + 1) };
};

const noStage = (stage: string, graph: PackGraph): string =>
  `names stage "${stage}", which pack "${graph.pack}" does not have`;

/**
 * Each `stages` entry's stage, its step names and the steps its drill-down covers. A covered
 * step the stage lacks leaves its card; a card, phase or drill-down left empty goes with it.
 */
function reconcileStages(r: Reconciling): void {
  for (const [name, words] of Object.entries(r.view.stages)) {
    const stage = r.stages.get(name);
    if (stage === undefined) {
      delete r.view.stages[name];
      r.drop(['stages', name], noStage(name, r.graph));
      continue;
    }
    const steps = new Set(stage.nodes.map(node => node.id));
    const noStep = (id: string): string =>
      `names step "${id}", which stage "${name}" does not have`;
    for (const id of Object.keys(words.steps ?? {}))
      if (!steps.has(id)) {
        delete words.steps?.[id];
        r.drop(['stages', name, 'steps', id], noStep(id));
      }
    if (words.drilldown === undefined) continue;
    const covered = new Map<string, string>();
    const phases = words.drilldown.phases.flatMap((phase, p) => {
      const cards = phase.cards.flatMap((card, c) => {
        const at: ProblemPath = ['stages', name, 'drilldown', 'phases', p, 'cards', c];
        const covers = card.covers.filter((id, k) => {
          if (!steps.has(id)) {
            r.drop([...at, 'covers', k], noStep(id));
            return false;
          }
          const first = covered.get(id);
          if (first !== undefined)
            r.error([...at, 'covers', k], `covers step "${id}", which card "${first}" covers`);
          else covered.set(id, card.title);
          return true;
        });
        if (covers.length > 0) return [{ ...card, covers }];
        r.drop(at, `card "${card.title}" covers no step stage "${name}" has`);
        return [];
      });
      if (cards.length > 0) return [{ ...phase, cards }];
      r.drop(['stages', name, 'drilldown', 'phases', p], `phase "${phase.label}" has no card left`);
      return [];
    });
    if (phases.length > 0) words.drilldown = { ...words.drilldown, phases };
    else {
      delete words.drilldown;
      r.drop(['stages', name, 'drilldown'], 'has no phase left');
    }
  }
}

/**
 * Whether an asks-settled arrow of `stage` leaves on `option`. An arrow with no option backs
 * every option unless it is on `withdrawn`: an `answered` or `any` binding starts on whatever
 * answer was chosen, while a withdrawal chooses none.
 */
const optionBacked = (graph: PackGraph, stage: GraphStage, option: string): boolean =>
  graph.arrows.some(
    ({ from }) =>
      'settled' in from &&
      from.stage === stage.name &&
      (from.option === option || (from.option === undefined && from.settled !== 'withdrawn'))
  );

/** Each `outcomes` key's stage and outcome, and each `answers` key's stage and option. */
function reconcileKeys(r: Reconciling): void {
  const { outcomes, answers } = r.view;
  for (const key of Object.keys(outcomes ?? {})) {
    const { stage: name, name: outcome } = splitKey(key);
    const stage = r.stages.get(name);
    const why =
      stage === undefined
        ? noStage(name, r.graph)
        : outcome !== '*' && !stage.outcome?.values.some(entry => entry.value === outcome)
          ? `names outcome "${outcome}", which stage "${name}" does not declare`
          : undefined;
    if (why === undefined || outcomes === undefined) continue;
    delete outcomes[key];
    r.drop(['outcomes', key], why);
  }
  for (const key of Object.keys(answers ?? {})) {
    const { stage: name, name: option } = splitKey(key);
    const stage = r.stages.get(name);
    const why =
      stage === undefined
        ? noStage(name, r.graph)
        : !optionBacked(r.graph, stage, option)
          ? `names option "${option}" of stage "${name}", but no asks-settled hand-off of the pack leaves on it`
          : undefined;
    if (why === undefined || answers === undefined) continue;
    delete answers[key];
    r.drop(['answers', key], why);
  }
}

/**
 * Each `groups` key is a group the pack document declares. A pack that declares none (no
 * document, or one without groups) drops them all, and the map draws a card per stage.
 */
function reconcileGroups(r: Reconciling): void {
  const { groups } = r.view;
  if (groups === undefined) return;
  const known = new Set(r.graph.groups.map(group => group.name));
  const problems = r.graph.document?.problems ?? [];
  // The graph serves no groups while its document has a problem, so say that too.
  const why =
    r.graph.groups.length === 0 && problems.length > 0
      ? `; the pack document's groups do not read: ${problems.join('; ')}`
      : '';
  for (const name of Object.keys(groups))
    if (!known.has(name)) {
      delete groups[name];
      r.drop(
        ['groups', name],
        `names group "${name}", which pack "${r.graph.pack}" does not declare${why}`
      );
    }
}

/** The stage `merged` names; without it the map takes the last in-flow stage. */
function reconcileMerged(r: Reconciling): void {
  if (r.view.merged === undefined || r.stages.has(r.view.merged)) return;
  r.drop(['merged'], noStage(r.view.merged, r.graph));
  delete r.view.merged;
}

/**
 * How it works stays a hand-drawn picture, but where its cards name stages it may not disagree
 * with the pack. A stage the graph lacks leaves the card's `stages`; a card left with none
 * stays drawn as a picture card bound to nothing. A `feeds` or `loops-back` edge between two
 * stage cards follows a graph arrow, or leaves the picture. A `calls` edge asks someone and
 * hands no work on, so it is not compared.
 */
function reconcileHowItWorks(r: Reconciling): void {
  const joined = joinedPairs(r.graph);
  for (const [viewId, picture] of Object.entries(r.view.howItWorks.views)) {
    const at: ProblemPath = ['howItWorks', 'views', viewId];
    const stagesOf = new Map<string, readonly string[]>();
    const cards = picture.cards.map((card, c) => {
      if (card.stages === undefined) return card;
      const stages = card.stages.filter((stage, s) => {
        if (r.stages.has(stage)) return true;
        r.drop([...at, 'cards', c, 'stages', s], noStage(stage, r.graph));
        return false;
      });
      if (stages.length === 0) {
        const { stages: _gone, ...unbound } = card;
        return unbound;
      }
      stagesOf.set(card.id, stages);
      return { ...card, stages };
    });
    const edges = picture.edges.filter((edge, e) => {
      const from = stagesOf.get(edge.from);
      const to = stagesOf.get(edge.to);
      if (edge.kind === 'calls' || from === undefined || to === undefined) return true;
      if (from.some(a => to.some(b => joined.has(pairKey(a, b))))) return true;
      r.drop(
        [...at, 'edges', e],
        `joins stages ${from.join(', ')} to ${to.join(', ')}, which no arrow of the pack graph connects`
      );
      return false;
    });
    r.view.howItWorks.views[viewId] = { ...picture, cards, edges };
  }
}

/** What the graph has that the view leaves out. Only in-flow stages: no item stands at the rest. */
function warnings(view: FactoryView, graph: PackGraph): FactoryViewProblem[] {
  const warns: FactoryViewProblem[] = [];
  for (const stage of graph.stages.filter(entry => entry.inFlow)) {
    // Words are a label, here or in its workflow's `display:`. An entry holding only a
    // drill-down names no stage, so the console would show the stage's id.
    if (view.stages[stage.workflow]?.label === undefined && stage.display === undefined)
      warns.push({
        severity: 'warning',
        path: ['stages'],
        message: `stage "${stage.workflow}" has no words`,
      });
  }
  for (const group of graph.groups)
    if (view.groups?.[group.name] === undefined)
      warns.push({
        severity: 'warning',
        path: ['groups'],
        message: `group "${group.name}" has no words`,
      });
  return warns;
}

/**
 * `view` with every entry naming what `graph` lacks taken out, and the problems: each drop and
 * each fault as it was found, then what the view leaves out. `view` itself is not changed.
 */
export function reconcileFactoryView(
  view: FactoryView,
  graph: PackGraph
): { view: FactoryView; problems: FactoryViewProblem[] } {
  const problems: FactoryViewProblem[] = [];
  const r: Reconciling = {
    view: structuredClone(view),
    graph,
    stages: new Map(graph.stages.map(stage => [stage.workflow, stage])),
    problems,
    drop: (path, message) =>
      problems.push({ severity: 'warning', path, message: `dropped: ${message}` }),
    error: (path, message) => problems.push({ severity: 'error', path, message }),
  };
  reconcileStages(r);
  reconcileKeys(r);
  reconcileGroups(r);
  reconcileMerged(r);
  reconcileHowItWorks(r);
  reconcileProgress(r, view);
  return { view: r.view, problems: [...problems, ...warnings(r.view, graph)] };
}

/** The problems of `view` against `graph`, for a caller that does not draw the view. */
export const checkFactoryView = (view: FactoryView, graph: PackGraph): FactoryViewProblem[] =>
  reconcileFactoryView(view, graph).problems;

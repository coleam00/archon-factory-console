/**
 * Factory views: how a workflow pack presents itself as a software factory in a console, as
 * stages an item moves through, a map of them, and where a finished run leaves an item.
 *
 * A view names a pack's workflows, outcomes and steps and computes nothing; a console reads
 * it beside the engine's own records, so it can draw a factory without naming a pack's
 * stages in code. The pack's author writes it as `<pack>/.shared/factory-view.json`, and a
 * project may present a pack it cannot edit with `.archon/packs/<pack key>.factory-view.json`.
 */
import { z } from 'zod';
import { workflowSourceSchema } from './workflow';

export const FACTORY_VIEW_FILE = 'factory-view.json';
/** Appended to a pack key to name the project file: `<pack key>.factory-view.json`. */
export const FACTORY_VIEW_PROJECT_SUFFIX = '.factory-view.json';
/** A map note may sit by the Needs-you list instead of a stage. */
export const FACTORY_VIEW_NEEDS_YOU = 'needs-you';

const labelSchema = z.string().min(1).max(80);
const stageIdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/, 'a lowercase slug such as "plan"');
/** A pack entrypoint's name, as the pack's manifest or folder names it. */
const workflowNameSchema = z.string().regex(/^[A-Za-z0-9_.-]+$/, 'a workflow name');
/**
 * A step id as the engine records it: an included workflow's node is `<include>__<node>`,
 * and a loop group's body node is `<group>.<node>`, as in `rounds.review__review`.
 */
const stepIdSchema = z.string().regex(/^[A-Za-z0-9_.-]+$/, 'a step id');
/**
 * `workflow:outcome`, the completed outcome of a run of a workflow the view names, or
 * `workflow:*` for every completed run of it no exact key takes.
 */
const outcomeKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_.-]+:([A-Za-z0-9_.-]+|\*)$/, 'workflow:outcome or workflow:*');

/** The real steps one card stands for: a workflow its stage lists, and step ids of it. */
const coverSchema = z.strictObject({
  workflow: workflowNameSchema,
  steps: z.array(stepIdSchema).min(1),
});

/** One card of a drill-down: a plain-words box standing for some of a workflow's real steps. */
const drilldownCardSchema = z.strictObject({
  title: labelSchema,
  /** One line, plain words: what the card does. */
  text: z.string().min(1).max(160),
  /** A Lucide icon name, as the console draws icons. */
  icon: z.string().regex(/^[a-z][a-z0-9-]*$/, 'a Lucide icon name such as "git-pull-request"'),
  /** Who does it: an agent, a check that approves or returns, a script, or you. */
  kind: z.enum(['agent', 'check', 'script', 'you']),
  /**
   * The real steps the card stands for. `bun run check:factory-view` reads the pack's
   * workflows and fails when a real step is covered by no card or by two.
   */
  covers: z.array(coverSchema).min(1),
});

/**
 * A stage told as a few numbered phases (columns, numbered by position from 1), each holding
 * a few cards, and at most one loop around the phases a loop group repeats.
 */
const drilldownSchema = z.strictObject({
  phases: z
    .array(
      z.strictObject({ label: labelSchema, cards: z.array(drilldownCardSchema).min(1).max(6) })
    )
    .min(1),
  /**
   * The loop group `step` of `workflow` repeats phases `from` to `to` (1-based): one line
   * drawn around them, labelled ("Up to 3 rounds"). The loop covers its group step.
   */
  loop: z
    .strictObject({
      label: labelSchema,
      from: z.number().int().min(1),
      to: z.number().int().min(1),
      workflow: workflowNameSchema,
      step: stepIdSchema,
    })
    .optional(),
});

const stageSchema = z.strictObject({
  id: stageIdSchema,
  label: labelSchema,
  /** One plain-words line: what this stage does to an item. */
  blurb: z.string().min(1).max(300),
  /** The colour group the map draws the stage in. */
  group: z.enum(['intake', 'build', 'check', 'land']),
  /** The pack entrypoints whose runs count here. Empty for a stage no run works, like Landed. */
  workflows: z.array(workflowNameSchema),
  /**
   * When given, a running run counts here only while one of these steps runs. A step
   * matches an entry equal to its id, or one its id begins with followed by `.`, so
   * `rounds` matches `rounds.fix`.
   */
  nodes: z.array(stepIdSchema).min(1).optional(),
  /** What the stage does, step by step, in plain words, for a stage page to draw. */
  drilldown: drilldownSchema.optional(),
});

/** A step of a workflow the view names, and the outcome it records that decides something. */
const decisionPointSchema = z.strictObject({
  workflow: workflowNameSchema,
  node: stepIdSchema,
  outcome: z.string().min(1),
});

const mapSchema = z.strictObject({
  cards: z.array(
    z.strictObject({
      stage: stageIdSchema,
      /*
       * The map once placed cards on a grid. It now draws them in `stages` order, so a second
       * order here could only disagree with that one; these are accepted, and ignored, so a
       * view file written for the grid still loads.
       */
      col: z.number().int().min(1).optional(),
      row: z.number().int().min(1).optional(),
    })
  ),
  /**
   * Every arrow the map draws, and no others: the hand-offs between stages and the send-backs,
   * curated by the view's author. The map reads no other source; `bun run check:factory-view`
   * keeps the hand-offs equal to the pack graph's (`GET /api/packs/{pack}/graph`): each one the
   * pack starts between two stages is declared, and each declared one the pack does not start
   * is marked as a person's step.
   */
  arrows: z.array(
    z.strictObject({
      from: stageIdSchema,
      to: stageIdSchema,
      /** The outcome that moves an item along, in plain words. */
      label: labelSchema.optional(),
      /*
       * Accepted, and ignored, so a view file that marks its send-backs still loads: the map
       * reads a send-back from `stages` order (an arrow into its own stage or an earlier one),
       * since a second statement of direction could only disagree with that order.
       */
      back: z.boolean().optional(),
      /** A step a person takes (a replan, a landing), which no pack hand-off starts. */
      person: z.boolean().optional(),
    })
  ),
  notes: z
    .array(z.strictObject({ text: z.string().min(1).max(160), near: z.string().min(1) }))
    .optional(),
});

const factoryViewShape = z.strictObject({
  version: z.literal(1),
  /** The pack this view draws: `owner/name` when installed, else its folder name. */
  pack: z
    .string()
    .regex(/^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)?$/, 'a pack folder name or owner/name'),
  title: labelSchema,
  /** One paragraph, plain words: what goes in, what comes out, where people step in. */
  summary: z.string().min(1).max(1200),
  /** Map cards and board columns, left to right. */
  stages: z.array(stageSchema).min(1),
  /**
   * Where an idle item sits after a run completed with this outcome; checked before
   * `endings`. `workflow:*` places every completed run of the workflow no exact key takes,
   * a run that returns no outcome included.
   */
  placement: z.record(outcomeKeySchema, stageIdSchema),
  /**
   * Outcomes that end an item without a change, with the label the folded row shows.
   * `workflow:*` takes every outcome no exact key does, not a run without one.
   */
  endings: z.record(outcomeKeySchema, labelSchema),
  /** The stage an item whose change merged sits in. */
  landed: z.strictObject({ stage: stageIdSchema }),
  /** The loop group whose iterations the board counts as rounds. */
  rounds: z.strictObject({ workflow: workflowNameSchema, loop: stepIdSchema }).optional(),
  /** The steps whose outcome sends an item back. */
  returns: z.array(decisionPointSchema).optional(),
  /**
   * The steps whose outcome approves an item: a round of the rounds loop in which one of
   * these recorded its outcome is approved. A round with neither a declared return nor a
   * declared approval needs a decision; nothing is read as approved unless declared here.
   */
  approves: z.array(decisionPointSchema).optional(),
  /** Where the change's URL is in a run's result, as a JSON pointer. */
  change: z
    .strictObject({
      workflow: workflowNameSchema,
      pointer: z.string().regex(/^\//, 'a JSON pointer starting with /'),
    })
    .optional(),
  /** The run input whose title line (after any front matter) is the item's title. */
  itemTitle: z.strictObject({ input: z.string().min(1) }).optional(),
  /**
   * Display names for a workflow's steps, keyed by the step id as the engine records it
   * (`build__build`, `rounds.fix`, the bare loop id `rounds`). A step with no name here
   * reads as its cleaned id. `bun run check:factory-view` reports a key naming no real step.
   */
  steps: z.record(workflowNameSchema, z.record(stepIdSchema, labelSchema)).optional(),
  map: mapSchema,
});

type FactoryViewShape = z.infer<typeof factoryViewShape>;
type Issue = { path: (string | number)[]; message: string };

/** Every place a declaration names a stage must name one it declares. */
function stageReferenceIssues(view: FactoryViewShape): Issue[] {
  const stages = new Set<string>();
  const issues: Issue[] = [];
  view.stages.forEach((stage, index) => {
    if (stages.has(stage.id))
      issues.push({
        path: ['stages', index, 'id'],
        message: `stage "${stage.id}" is declared twice`,
      });
    stages.add(stage.id);
  });
  const refer = (path: Issue['path'], stage: string, allowed?: string): void => {
    if (stages.has(stage) || stage === allowed) return;
    issues.push({ path, message: `names stage "${stage}", which is not declared in stages` });
  };
  for (const [key, stage] of Object.entries(view.placement)) refer(['placement', key], stage);
  refer(['landed', 'stage'], view.landed.stage);
  view.map.cards.forEach((card, index) => {
    refer(['map', 'cards', index, 'stage'], card.stage);
  });
  view.map.arrows.forEach((arrow, index) => {
    refer(['map', 'arrows', index, 'from'], arrow.from);
    refer(['map', 'arrows', index, 'to'], arrow.to);
  });
  view.map.notes?.forEach((note, index) => {
    refer(['map', 'notes', index, 'near'], note.near, FACTORY_VIEW_NEEDS_YOU);
  });
  return issues;
}

/** Every workflow the declaration reads outcomes or steps of is one a stage counts. */
function workflowReferenceIssues(view: FactoryViewShape): Issue[] {
  const workflows = new Set(view.stages.flatMap(stage => stage.workflows));
  const issues: Issue[] = [];
  const refer = (path: Issue['path'], workflow: string): void => {
    if (!workflows.has(workflow))
      issues.push({ path, message: `names workflow "${workflow}", which no stage lists` });
  };
  const workflowOf = (key: string): string => key.slice(0, key.lastIndexOf(':'));
  for (const key of Object.keys(view.placement)) refer(['placement', key], workflowOf(key));
  for (const key of Object.keys(view.endings)) refer(['endings', key], workflowOf(key));
  if (view.rounds !== undefined) refer(['rounds', 'workflow'], view.rounds.workflow);
  view.returns?.forEach((entry, index) => {
    refer(['returns', index, 'workflow'], entry.workflow);
  });
  view.approves?.forEach((entry, index) => {
    refer(['approves', index, 'workflow'], entry.workflow);
  });
  if (view.change !== undefined) refer(['change', 'workflow'], view.change.workflow);
  for (const workflow of Object.keys(view.steps ?? {})) refer(['steps', workflow], workflow);
  return issues;
}

/**
 * A drill-down tells its own stage: each card covers, and its loop names, a workflow the
 * stage lists, and the loop spans phases it has. Whether a step is real only the coverage
 * check can say, from the pack's workflows.
 */
function drilldownIssues(view: FactoryViewShape): Issue[] {
  const issues: Issue[] = [];
  view.stages.forEach((stage, s) => {
    const { drilldown } = stage;
    if (drilldown === undefined) return;
    const at = ['stages', s, 'drilldown'];
    const own = (path: Issue['path'], workflow: string): void => {
      if (!stage.workflows.includes(workflow))
        issues.push({
          path,
          message: `names workflow "${workflow}", which stage "${stage.id}" does not list`,
        });
    };
    drilldown.phases.forEach((phase, p) => {
      phase.cards.forEach((card, c) => {
        card.covers.forEach((cover, k) => {
          own([...at, 'phases', p, 'cards', c, 'covers', k, 'workflow'], cover.workflow);
        });
      });
    });
    const { loop } = drilldown;
    if (loop === undefined) return;
    own([...at, 'loop', 'workflow'], loop.workflow);
    if (loop.from > loop.to || loop.to > drilldown.phases.length)
      issues.push({
        path: [...at, 'loop'],
        message: `spans phases ${String(loop.from)} to ${String(loop.to)}; the drill-down has phases 1 to ${String(drilldown.phases.length)}`,
      });
  });
  return issues;
}

export const factoryViewSchema = factoryViewShape.superRefine((view, ctx) => {
  for (const issue of [
    ...stageReferenceIssues(view),
    ...workflowReferenceIssues(view),
    ...drilldownIssues(view),
  ])
    ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
});
export type FactoryView = z.infer<typeof factoryViewSchema>;
export type FactoryStage = FactoryView['stages'][number];
export type FactoryDrilldown = NonNullable<FactoryStage['drilldown']>;

/** Where a view was found: a pack's own file, or the project's file for a pack. */
export const factoryViewSourceSchema = z.enum([...workflowSourceSchema.options, 'project-file']);
export type FactoryViewSource = z.infer<typeof factoryViewSourceSchema>;

export const factoryViewsListingSchema = z.object({
  views: z.array(
    z.object({
      /** The declaration's pack: `owner/name` when installed, else its folder name. */
      pack: z.string(),
      /** The pack's folder key (`owner.name` when installed): the `{pack}` of `GET /api/packs/{pack}/graph`. */
      packKey: z.string(),
      /**
       * Each workflow a stage lists, as the view names it, to the name its runs record and
       * the pack graph's stages carry (`owner/name:workflow` when installed).
       */
      runNames: z.record(z.string(), z.string()),
      source: factoryViewSourceSchema,
      /** The file the view was read from. */
      path: z.string(),
      declaration: factoryViewSchema,
    })
  ),
  /** Declarations that could not be read or did not validate, each with its file. */
  errors: z.array(
    z.object({
      pack: z.string(),
      source: factoryViewSourceSchema,
      path: z.string(),
      error: z.string(),
    })
  ),
});
export type FactoryViewsListing = z.infer<typeof factoryViewsListingSchema>;

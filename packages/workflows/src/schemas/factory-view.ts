/**
 * A factory view: how a workflow pack presents itself as a software factory in a console. The
 * pack's author writes it as `<pack>/.shared/factory-view.json`, and it travels with the pack.
 *
 * It is presentation only: words for the pack document's groups, the map's stage cards (each
 * a label, blurb and drill-down over some of the pack's stages), words for steps and outcomes,
 * story wording, map edge labels and How it works. Structure (stages, steps, outcomes, arrows
 * and groups) comes from the pack graph (`GET /api/packs/{pack}/graph`): the file only names
 * what the graph has, and `checkFactoryView` fails a name the graph lacks.
 *
 * The top level is not strict: more than one Archon version reads a pack's file, so a key a
 * newer one adds must not make an older one reject it. Nested objects are strict, so a typo
 * there is caught.
 */
import { z } from 'zod';
import type { Issue } from './factory-overview-geometry';
import { howItWorksIssues, howItWorksShape } from './factory-view-how-it-works';

export const FACTORY_VIEW_FILE = 'factory-view.json';
/** A map note may sit by the Needs-you list instead of a stage card. */
const NEEDS_YOU = 'needs-you';

const labelSchema = z.string().min(1).max(80);
const cardIdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/, 'a lowercase slug such as "plan"');
/** A stage of the pack by its name within the pack: the graph stage's `workflow`. */
const workflowNameSchema = z.string().regex(/^[A-Za-z0-9_.-]+$/, 'a workflow name');
/**
 * A step id as the engine records it: an included workflow's node is `<include>__<node>`,
 * and a loop group's body node is `<group>.<node>`.
 */
const stepIdSchema = z.string().regex(/^[A-Za-z0-9_.-]+$/, 'a step id');
/**
 * `workflow:outcome`, an outcome a run of the workflow completes with, or `workflow:*` for
 * every completed run of it no exact key takes.
 */
const outcomeKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_.-]+:([A-Za-z0-9_.-]+|\*)$/, 'workflow:outcome or workflow:*');
/** One plain sentence a person reads about what a run did: no placeholders, no markup. */
const sentenceSchema = z.string().trim().min(1).max(160);

/** The icons a drill-down card may show; a console maps each one, so the set is closed. */
const drilldownIconSchema = z.enum([
  'inbox',
  'scale',
  'link',
  'ruler',
  'scissors',
  'database',
  'clipboard-list',
  'pencil',
  'wrench',
  'git-branch',
  'search-code',
  'flask-conical',
  'monitor-check',
  'gavel',
  'message-square',
  'circle-alert',
  'git-pull-request',
  'flag',
  'send',
  'shield-check',
  'git-merge',
]);

/** One card of a drill-down: a plain-words box saying what part of the stage does. */
const drilldownCardSchema = z.strictObject({
  title: labelSchema,
  /** One line, plain words: what the card does. */
  text: z.string().min(1).max(160),
  icon: drilldownIconSchema,
  /** Who does it: an agent, a check that approves or returns, a script, or you. */
  kind: z.enum(['agent', 'check', 'script', 'you']),
});

/**
 * A stage told as a few numbered phases (columns, numbered from 1), each holding a few cards,
 * and at most one loop line drawn around phases `from` to `to`, labelled ("Up to 3 rounds").
 */
const drilldownSchema = z.strictObject({
  phases: z
    .array(
      z.strictObject({ label: labelSchema, cards: z.array(drilldownCardSchema).min(1).max(6) })
    )
    .min(1),
  loop: z
    .strictObject({
      label: labelSchema,
      from: z.number().int().min(1),
      to: z.number().int().min(1),
    })
    .optional(),
});

/**
 * One stage card of the map, in map order. It stands for one or more of the pack's stages; its
 * group is theirs, from the pack document, so the card names none.
 */
const stageCardSchema = z.strictObject({
  id: cardIdSchema,
  label: labelSchema,
  /** The map card's one line, at most 24 characters. Absent, the map shows the blurb, cut to fit. */
  short: z.string().min(1).max(24).optional(),
  /** One plain-words line: what this stage does to an item. */
  blurb: z.string().min(1).max(300),
  /** The pack's stages whose runs count here, by name within the pack, or retired names. */
  workflows: z.array(workflowNameSchema).min(1),
  /** What the stage does, in plain words, for the stage modal. */
  drilldown: drilldownSchema.optional(),
});

const storySchema = z.strictObject({
  /**
   * One sentence per completed outcome. A sentence may instead be `{ withChange, withoutChange }`,
   * chosen by whether the item has a change, for an outcome a run records alike with and
   * without one.
   */
  outcomes: z
    .record(
      outcomeKeySchema,
      z.union([
        sentenceSchema,
        z.strictObject({ withChange: sentenceSchema, withoutChange: sentenceSchema }),
      ])
    )
    .optional(),
  /** The earlier steps of a run that works several, by the step each starts on. */
  steps: z.record(workflowNameSchema, z.record(stepIdSchema, sentenceSchema)).optional(),
  /** Plain words a console uses where it tells rounds, returns, parked items and work orders. */
  words: z
    .strictObject({
      round: labelSchema.optional(),
      rounds: labelSchema.optional(),
      returned: labelSchema.optional(),
      sentBack: labelSchema.optional(),
      parked: labelSchema.optional(),
      workOrder: labelSchema.optional(),
      workOrders: labelSchema.optional(),
    })
    .optional(),
});

const mapSchema = z.strictObject({
  /**
   * Words for the map's arrows, not the arrows: the map draws what the pack graph connects
   * between two stage cards, and an entry here labels the arrow from card `from` to card `to`.
   */
  labels: z
    .array(z.strictObject({ from: cardIdSchema, to: cardIdSchema, label: labelSchema }))
    .optional(),
  /** A line of text by a stage card, or by the Needs-you list (`near: "needs-you"`). */
  notes: z
    .array(z.strictObject({ text: z.string().min(1).max(160), near: z.string().min(1) }))
    .optional(),
});

const factoryViewShape = z.object({
  version: z.literal(1),
  title: labelSchema,
  /** One paragraph, plain words: what goes in, what comes out, where people step in. */
  summary: z.string().min(1).max(1200),
  /** Words for the pack document's groups, by the group's name there. */
  groups: z
    .record(z.string().min(1), z.strictObject({ blurb: z.string().min(1).max(160) }))
    .optional(),
  stages: z.array(stageCardSchema).min(1),
  /**
   * Workflows the pack no longer has whose stored runs still need words. Nothing named under a
   * retired workflow is compared with the graph; a card may still list one.
   */
  retired: z.array(workflowNameSchema).optional(),
  /** Display names for a stage's steps, by step id. A step with none reads as its cleaned id. */
  steps: z.record(workflowNameSchema, z.record(stepIdSchema, labelSchema)).optional(),
  /** The label an item ended by this outcome shows, by `workflow:outcome`. */
  endings: z.record(outcomeKeySchema, labelSchema).optional(),
  story: storySchema.optional(),
  map: mapSchema.optional(),
  howItWorks: howItWorksShape,
});
type FactoryViewShape = z.infer<typeof factoryViewShape>;

/** Stage card ids are unique, and a map label or note names a card there is. */
function cardIssues(view: FactoryViewShape): Issue[] {
  const ids = new Set<string>();
  const issues: Issue[] = [];
  view.stages.forEach((card, index) => {
    if (ids.has(card.id))
      issues.push({
        path: ['stages', index, 'id'],
        message: `card "${card.id}" is declared twice`,
      });
    ids.add(card.id);
  });
  const refer = (path: Issue['path'], id: string): void => {
    if (!ids.has(id))
      issues.push({ path, message: `names card "${id}", which is not declared in stages` });
  };
  view.map?.labels?.forEach((label, index) => {
    refer(['map', 'labels', index, 'from'], label.from);
    refer(['map', 'labels', index, 'to'], label.to);
  });
  view.map?.notes?.forEach((note, index) => {
    if (note.near !== NEEDS_YOU) refer(['map', 'notes', index, 'near'], note.near);
  });
  return issues;
}

/** A drill-down's loop spans phases it has. */
function loopIssues(view: FactoryViewShape): Issue[] {
  return view.stages.flatMap((card, index) => {
    const drilldown = card.drilldown;
    const loop = drilldown?.loop;
    if (drilldown === undefined || loop === undefined) return [];
    if (loop.from <= loop.to && loop.to <= drilldown.phases.length) return [];
    return [
      {
        path: ['stages', index, 'drilldown', 'loop'],
        message: `spans phases ${String(loop.from)} to ${String(loop.to)}; the drill-down has phases 1 to ${String(drilldown.phases.length)}`,
      },
    ];
  });
}

export const factoryViewFileSchema = factoryViewShape.superRefine((view, ctx) => {
  for (const issue of [
    ...cardIssues(view),
    ...loopIssues(view),
    ...howItWorksIssues(view.howItWorks).map(issue => ({
      ...issue,
      path: ['howItWorks', ...issue.path],
    })),
  ])
    ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
});
export type FactoryViewFile = z.infer<typeof factoryViewFileSchema>;
export type FactoryStageCard = FactoryViewFile['stages'][number];

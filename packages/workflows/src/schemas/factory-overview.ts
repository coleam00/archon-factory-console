/**
 * Factory overviews: a hand-curated explainer of how a pack's factory runs, for presenting it.
 * Not live, not exhaustive, and never generated from workflow YAML: the pack's author writes it
 * as `<pack>/.shared/factory-overview.json`, and a project may present a pack it cannot edit
 * with `.archon/packs/<pack key>.factory-overview.json`.
 *
 * An overview is a root view and drill-downs a card `opens`. Each view lays its cards out on a
 * 1-based grid and joins them with edges, which a console draws straight: an edge runs along a
 * row or a column its two ends share, and the one `loops-back` edge drops from its source, runs
 * in a lane under everything, and rises into its target. The schema rejects a file whose lines
 * would run through a card, cross a group it does not belong to, or cross another line, so
 * nothing crosses in any file that validates (`factory-overview-geometry.ts`).
 */
import { z } from 'zod';
import { factoryViewSourceSchema } from './factory-view';
import { geometryIssues, type Issue } from './factory-overview-geometry';

export const FACTORY_OVERVIEW_FILE = 'factory-overview.json';
/** Appended to a pack key to name the project file: `<pack key>.factory-overview.json`. */
export const FACTORY_OVERVIEW_PROJECT_SUFFIX = '.factory-overview.json';

const slugSchema = z.string().regex(/^[a-z][a-z0-9-]*$/, 'a lowercase slug such as "build"');

/** What a card stands for: its legend entry and its colour. */
export const factoryOverviewKindSchema = z.enum([
  'input',
  'stage',
  'check',
  'person',
  'gate',
  'outcome',
]);
export type FactoryOverviewKind = z.infer<typeof factoryOverviewKindSchema>;

/** The icons a card may show; a console maps each one, so the set is closed. */
export const factoryOverviewIconSchema = z.enum([
  'inbox',
  'issue',
  'order',
  'search',
  'scale',
  'map',
  'list',
  'hammer',
  'git-pull-request',
  'check',
  'flask',
  'eye',
  'sparkles',
  'gavel',
  'users',
  'flag',
  'rotate',
]);
export type FactoryOverviewIcon = z.infer<typeof factoryOverviewIconSchema>;

export const factoryOverviewEdgeKindSchema = z.enum(['feeds', 'calls', 'loops-back']);
export type FactoryOverviewEdgeKind = z.infer<typeof factoryOverviewEdgeKindSchema>;

const cardSchema = z.strictObject({
  /** Unique across the whole file, so a card names one place. */
  id: slugSchema,
  title: z.string().min(1).max(40),
  /** One line, plain words. */
  text: z.string().min(1).max(120),
  icon: factoryOverviewIconSchema,
  kind: factoryOverviewKindSchema,
  col: z.number().int().min(1),
  row: z.number().int().min(1),
  /** The group of the same view this card sits in. */
  group: slugSchema.optional(),
  /** The view this card opens: a closer look at what it stands for. */
  opens: slugSchema.optional(),
});

const groupSchema = z.strictObject({
  /** Unique across the whole file, cards included. */
  id: slugSchema,
  label: z.string().min(1).max(40),
});

const edgeSchema = z.strictObject({
  /** A card or a group of the same view. */
  from: slugSchema,
  to: slugSchema,
  /** `feeds` hands work on; `calls` asks someone; `loops-back` sends work back. */
  kind: factoryOverviewEdgeKindSchema,
  label: z.string().min(1).max(40).optional(),
});

const viewSchema = z.strictObject({
  /** A drill-down's own line, under its map; the root's is the overview's caption. */
  caption: z.string().min(1).max(400).optional(),
  groups: z.array(groupSchema).optional(),
  cards: z.array(cardSchema).min(1),
  edges: z.array(edgeSchema),
});
export type FactoryOverviewView = z.infer<typeof viewSchema>;

const factoryOverviewShape = z.strictObject({
  version: z.literal(1),
  /** The pack this overview explains: `owner/name` when installed, else its folder name. */
  pack: z
    .string()
    .regex(/^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)?$/, 'a pack folder name or owner/name'),
  /** The page heading and the breadcrumb's first entry. */
  title: z.string().min(1).max(80),
  /** One paragraph under the root view's map, plain words for someone who has never seen Archon. */
  caption: z.string().min(1).max(800),
  /** The view the page opens on. */
  root: slugSchema,
  /** Every view by id: the root and the drill-downs cards open. */
  views: z.record(slugSchema, viewSchema),
});

type FactoryOverviewShape = z.infer<typeof factoryOverviewShape>;

/** Card and group ids are unique across the file, so a breadcrumb or a link names one place. */
function idIssues(overview: FactoryOverviewShape): Issue[] {
  const seen = new Set<string>();
  const issues: Issue[] = [];
  const claim = (id: string, path: Issue['path']): void => {
    if (seen.has(id)) issues.push({ path, message: `id "${id}" is used twice in this file` });
    seen.add(id);
  };
  for (const [viewId, view] of Object.entries(overview.views)) {
    view.groups?.forEach((group, index) => {
      claim(group.id, ['views', viewId, 'groups', index, 'id']);
    });
    view.cards.forEach((card, index) => {
      claim(card.id, ['views', viewId, 'cards', index, 'id']);
    });
  }
  return issues;
}

/**
 * The views form one tree from the root through `opens`: every other view is opened by
 * exactly one card, the root by none, and a walk from the root reaches every view.
 */
function openIssues(overview: FactoryOverviewShape): Issue[] {
  const issues: Issue[] = [];
  if (overview.views[overview.root] === undefined)
    return [{ path: ['root'], message: `names view "${overview.root}", which is not in views` }];
  const openedBy = new Map<string, string>();
  for (const [viewId, view] of Object.entries(overview.views))
    view.cards.forEach((card, index) => {
      if (card.opens === undefined) return;
      const path = ['views', viewId, 'cards', index, 'opens'];
      if (overview.views[card.opens] === undefined)
        issues.push({ path, message: `names view "${card.opens}", which is not in views` });
      else if (card.opens === viewId || card.opens === overview.root)
        issues.push({ path, message: `opens "${card.opens}", which would loop back up the tree` });
      else if (openedBy.has(card.opens))
        issues.push({
          path,
          message: `opens "${card.opens}", which card "${openedBy.get(card.opens) ?? ''}" opens too`,
        });
      else openedBy.set(card.opens, card.id);
    });
  const reached = reachable(overview);
  for (const viewId of Object.keys(overview.views))
    if (!reached.has(viewId))
      issues.push({ path: ['views', viewId], message: 'no card reachable from the root opens it' });
  return issues;
}

/** The views a walk along `opens` from the root reaches. */
function reachable(overview: FactoryOverviewShape): Set<string> {
  const reached = new Set<string>();
  const walk = (viewId: string): void => {
    const view = overview.views[viewId];
    if (view === undefined || reached.has(viewId)) return;
    reached.add(viewId);
    for (const card of view.cards) if (card.opens !== undefined) walk(card.opens);
  };
  walk(overview.root);
  return reached;
}

/** One loops-back line per view at most, and exactly one in the root: the lane under the line. */
function loopIssues(overview: FactoryOverviewShape): Issue[] {
  const issues: Issue[] = [];
  for (const [viewId, view] of Object.entries(overview.views)) {
    const loops = view.edges.filter(edge => edge.kind === 'loops-back').length;
    if (loops > 1)
      issues.push({
        path: ['views', viewId, 'edges'],
        message: `has ${loops.toString()} loops-back edges; a view draws one lane at most`,
      });
    if (viewId === overview.root && loops === 0)
      issues.push({
        path: ['views', viewId, 'edges'],
        message: 'the root view needs its one loops-back edge',
      });
  }
  return issues;
}

export const factoryOverviewSchema = factoryOverviewShape.superRefine((overview, ctx) => {
  const issues = [
    ...idIssues(overview),
    ...openIssues(overview),
    ...loopIssues(overview),
    ...Object.entries(overview.views).flatMap(([viewId, view]) =>
      geometryIssues(view).map(issue => ({ ...issue, path: ['views', viewId, ...issue.path] }))
    ),
  ];
  for (const issue of issues)
    ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
});
export type FactoryOverview = z.infer<typeof factoryOverviewSchema>;

export const factoryOverviewsListingSchema = z.object({
  overviews: z.array(
    z.object({
      /** The overview's pack: `owner/name` when installed, else its folder name. */
      pack: z.string(),
      source: factoryViewSourceSchema,
      /** The file the overview was read from. */
      path: z.string(),
      declaration: factoryOverviewSchema,
    })
  ),
  /** Overview files that could not be read or did not validate, each with its file. */
  errors: z.array(
    z.object({
      pack: z.string(),
      source: factoryViewSourceSchema,
      path: z.string(),
      error: z.string(),
    })
  ),
});
export type FactoryOverviewsListing = z.infer<typeof factoryOverviewsListingSchema>;

/** One pack's overview, or null when it has none, and the errors of the files that would give it. */
export const factoryOverviewForPackSchema = z.object({
  overview: factoryOverviewsListingSchema.shape.overviews.element.nullable(),
  errors: factoryOverviewsListingSchema.shape.errors,
});
export type FactoryOverviewForPack = z.infer<typeof factoryOverviewForPackSchema>;

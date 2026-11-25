/**
 * The How it works part of a factory view file (`factory-view.ts` owns the file): a
 * hand-curated explainer of how a pack's factory runs, for presenting it. A root view and
 * drill-downs a card `opens`; each view lays its cards out on a 1-based grid and joins them
 * with edges a console draws straight (`factory-overview-geometry.ts`,
 * `factory-overview-lanes.ts`). Whether its stage edges agree with the pack graph is
 * `checkFactoryView`'s call, not the schema's.
 */
import { z } from 'zod';
import { geometryIssues, type Issue } from './factory-overview-geometry';

const slugSchema = z.string().regex(/^[a-z][a-z0-9-]*$/, 'a lowercase slug such as "build"');

/** What a card stands for: its legend entry and its colour. */
const cardKindSchema = z.enum(['input', 'stage', 'check', 'person', 'gate', 'outcome']);

/** The icons a card may show; a console maps each one, so the set is closed. */
const cardIconSchema = z.enum([
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

const cardSchema = z.strictObject({
  /** Unique across the whole How it works, so a card names one place. */
  id: slugSchema,
  title: z.string().min(1).max(40),
  /** One line, plain words. */
  text: z.string().min(1).max(120),
  icon: cardIconSchema,
  kind: cardKindSchema,
  col: z.number().int().min(1),
  row: z.number().int().min(1),
  /** The lane (a group of the same view) this card sits in. */
  group: slugSchema.optional(),
  /**
   * The view this card opens: a closer look at what it stands for. A view whose id is a stage
   * card's id stands for that stage, so the card does too.
   */
  opens: slugSchema.optional(),
});

const groupSchema = z.strictObject({
  /** Unique across the whole How it works, cards included. */
  id: slugSchema,
  label: z.string().min(1).max(40),
});

const edgeSchema = z.strictObject({
  /** A card or a group of the same view. */
  from: slugSchema,
  to: slugSchema,
  /** `feeds` hands work on; `calls` asks someone; `loops-back` sends work back. */
  kind: z.enum(['feeds', 'calls', 'loops-back']),
  label: z.string().min(1).max(40).optional(),
});

const viewSchema = z.strictObject({
  /** A drill-down's own line, under its map. The root view takes none: its line is `caption`. */
  caption: z.string().min(1).max(400).optional(),
  groups: z.array(groupSchema).optional(),
  cards: z.array(cardSchema).min(1),
  edges: z.array(edgeSchema),
});

export const howItWorksShape = z.strictObject({
  /** The page heading and the breadcrumb's first entry. */
  title: z.string().min(1).max(80),
  /** One paragraph under the root view's map, plain words for someone who has never seen Archon. */
  caption: z.string().min(1).max(800),
  /** The view the page opens on. */
  root: slugSchema,
  /** Every view by id: the root and the drill-downs cards open. */
  views: z.record(slugSchema, viewSchema),
});
export type HowItWorks = z.infer<typeof howItWorksShape>;

/** Card and group ids are unique across How it works, so a breadcrumb or a link names one place. */
function idIssues(how: HowItWorks): Issue[] {
  const seen = new Set<string>();
  const issues: Issue[] = [];
  const claim = (id: string, path: Issue['path']): void => {
    if (seen.has(id)) issues.push({ path, message: `id "${id}" is used twice in How it works` });
    seen.add(id);
  };
  for (const [viewId, view] of Object.entries(how.views)) {
    view.groups?.forEach((group, index) => {
      claim(group.id, ['views', viewId, 'groups', index, 'id']);
    });
    view.cards.forEach((card, index) => {
      claim(card.id, ['views', viewId, 'cards', index, 'id']);
    });
  }
  return issues;
}

/** The views a walk along `opens` from the root reaches. */
function reachable(how: HowItWorks): Set<string> {
  const reached = new Set<string>();
  const walk = (viewId: string): void => {
    const view = how.views[viewId];
    if (view === undefined || reached.has(viewId)) return;
    reached.add(viewId);
    for (const card of view.cards) if (card.opens !== undefined) walk(card.opens);
  };
  walk(how.root);
  return reached;
}

/**
 * The views form one tree from the root through `opens`: every other view is opened by
 * exactly one card, the root by none, and a walk from the root reaches every view.
 */
function openIssues(how: HowItWorks): Issue[] {
  if (how.views[how.root] === undefined)
    return [{ path: ['root'], message: `names view "${how.root}", which is not in views` }];
  const issues: Issue[] = [];
  const openedBy = new Map<string, string>();
  for (const [viewId, view] of Object.entries(how.views))
    view.cards.forEach((card, index) => {
      if (card.opens === undefined) return;
      const path = ['views', viewId, 'cards', index, 'opens'];
      if (how.views[card.opens] === undefined)
        issues.push({ path, message: `names view "${card.opens}", which is not in views` });
      else if (card.opens === viewId || card.opens === how.root)
        issues.push({ path, message: `opens "${card.opens}", which would loop back up the tree` });
      else if (openedBy.has(card.opens))
        issues.push({
          path,
          message: `opens "${card.opens}", which card "${openedBy.get(card.opens) ?? ''}" opens too`,
        });
      else openedBy.set(card.opens, card.id);
    });
  const reached = reachable(how);
  for (const viewId of Object.keys(how.views))
    if (!reached.has(viewId))
      issues.push({ path: ['views', viewId], message: 'no card reachable from the root opens it' });
  return issues;
}

/**
 * The root's line is `caption`, so a caption on the root view would never show; and the root
 * shows how work goes back, so it needs a loops-back edge.
 */
function rootIssues(how: HowItWorks): Issue[] {
  const root = how.views[how.root];
  if (root === undefined) return [];
  const issues: Issue[] = [];
  if (root.caption !== undefined)
    issues.push({
      path: ['views', how.root, 'caption'],
      message: "the root view's line is How it works' own caption; move it there",
    });
  if (!root.edges.some(edge => edge.kind === 'loops-back'))
    issues.push({
      path: ['views', how.root, 'edges'],
      message: 'the root view needs a loops-back edge: the way work is sent back',
    });
  return issues;
}

/** Every issue How it works has on its own, paths relative to it. */
export function howItWorksIssues(how: HowItWorks): Issue[] {
  return [
    ...idIssues(how),
    ...openIssues(how),
    ...rootIssues(how),
    ...Object.entries(how.views).flatMap(([viewId, view]) =>
      geometryIssues(view).map(issue => ({ ...issue, path: ['views', viewId, ...issue.path] }))
    ),
  ];
}

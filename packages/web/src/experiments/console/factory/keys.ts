/**
 * The factory's cache keys. Item reads sit under `runs:` on purpose: the dashboard SSE
 * invalidates `runs` when a run starts, changes step or ends, as does Archon's answer panel for a
 * paused run, so the board, the map and an item page read again with no hook of their own. An
 * answer given through Archon's ask section refreshes only its own read; `useItemAsks` refreshes
 * the item reads then.
 */
export const FACTORY_ITEMS = 'runs:factory-items';

export const FK = {
  factoryViews: (projectId: string): string => `factory-views:${projectId}`,
  // Under `projects:` on purpose: adding, removing or renaming a project invalidates
  // `projects`, and the packs list which projects run each pack.
  factoryPacks: 'projects:factory-packs' as const,
  // Every page of one project's items.
  factoryItems: (projectId: string): string => `${FACTORY_ITEMS}:${projectId}`,
  // Under the same prefix, so whatever refreshes a project's items refreshes one item's page too.
  factoryItem: (projectId: string, key: string): string =>
    `${FACTORY_ITEMS}:${projectId}:item:${key}`,
  // A project's items without the factory progress join, for a project no factory view applies to.
  projectItems: (projectId: string): string => `${FACTORY_ITEMS}:${projectId}:window`,
} as const;

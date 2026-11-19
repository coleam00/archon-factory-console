import type { To } from 'react-router';
import type { FactoryPacksRead, FactoryViews } from '../../skills/factory';

/** One view the server listed, with where it was found. */
export type FactoryViewListed = FactoryViews['views'][number];

/** One pack with a factory overview file, as the server listed it. */
export type FactoryPackListed = FactoryPacksRead['packs'][number];

/**
 * Whether a project gets the Factory tab: a view applies, or the project's own view file is
 * broken. A project file is an explicit opt-in, so its error shows on the tab instead of the
 * tab vanishing; a broken file in some pack the project never ran stays out of its way.
 */
export function factoryTabShown(listing: FactoryViews | undefined): boolean {
  if (listing === undefined) return false;
  return listing.views.length > 0 || listing.errors.some(error => error.source === 'project-file');
}

/**
 * The view the Factory tab draws. The server lists project files first, so a project's own
 * view wins. A project that two packs' views apply to shows the first; choosing between
 * several is not built yet.
 */
export function currentView(listing: FactoryViews | undefined): FactoryViewListed | undefined {
  return listing?.views[0];
}

/** The Factory section's paths under one project. */
export function factoryPath(projectId: string, rest = ''): string {
  return `/console/p/${projectId}/factory${rest}`;
}

/** A link that opens a stage as the modal over the Overview's map. */
export interface StageModalLink {
  to: To;
  /**
   * Marks the entry the link pushed, so closing the modal goes back to the entry before it;
   * `tab` opens it on that tab rather than the stage's first.
   */
  state: { stageModal: true; tab?: StageTab };
}

/** The tabs a stage opens on: what it does, the items in it, its real workflow. */
export type StageTab = 'does' | 'items' | 'workflow';

/**
 * The Overview with `stage` open as a modal over its map: `?stage=<id>`, pushed, so Back closes
 * it, and on `tab` when one is given.
 */
export function stageModalLink(projectId: string, stage: string, tab?: StageTab): StageModalLink {
  return {
    to: { pathname: factoryPath(projectId), search: `?stage=${encodeURIComponent(stage)}` },
    state: tab === undefined ? { stageModal: true } : { stageModal: true, tab },
  };
}

/** A pack's Factory pages in the console's sidebar, by the pack's key (`owner.name` when installed). */
export function factoryPackPath(packKey: string, rest = '/how-it-works'): string {
  return `/console/factory/${encodeURIComponent(packKey)}${rest}`;
}

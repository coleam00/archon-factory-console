import { factoryTabShown } from './lib/views';
import { useFactoryPacks } from './useFactoryPacks';

/**
 * Whether the project tabs show Factory for `projectId`. It reads the packs list the sidebar's
 * Factory entry already reads (cached, `FK.factoryPacks`), never the project's views: a
 * project's view is read only on its Factory pages (DESIGN.md, "v2 direction"), so a Runs,
 * Chat or Metrics page asks the server nothing per project for the tab.
 */
export function useFactoryTabShown(projectId: string): boolean {
  return factoryTabShown(useFactoryPacks().data, projectId);
}

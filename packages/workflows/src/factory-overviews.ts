/**
 * Discover factory overviews (`schemas/factory-overview.ts`) for a project, found as factory
 * views are (`factory-pack-files.ts`): a project file `.archon/packs/<pack key>.factory-overview.json`,
 * then `<pack>/.shared/factory-overview.json` in every pack the project can run.
 */
import { discoverPackFiles, factoryPackKey } from './factory-pack-files';
import {
  FACTORY_OVERVIEW_FILE,
  FACTORY_OVERVIEW_PROJECT_SUFFIX,
  factoryOverviewSchema,
  type FactoryOverviewForPack,
  type FactoryOverviewsListing,
} from './schemas/factory-overview';
import type { LiveWorkflowSourceRoots } from './workflow-source/roots';

/** Every overview and error under `roots`. */
export async function discoverFactoryOverviews(
  roots: LiveWorkflowSourceRoots
): Promise<FactoryOverviewsListing> {
  const { found, errors } = await discoverPackFiles(
    {
      fileName: FACTORY_OVERVIEW_FILE,
      projectSuffix: FACTORY_OVERVIEW_PROJECT_SUFFIX,
      schema: factoryOverviewSchema,
    },
    roots
  );
  return { overviews: found, errors };
}

/**
 * One pack's overview, and the errors of the files that would have given it: a broken project
 * file is listed under the key its name gives, a broken pack file under the pack's identity.
 */
export function factoryOverviewForPack(
  listing: FactoryOverviewsListing,
  pack: string
): FactoryOverviewForPack {
  const key = factoryPackKey(pack);
  const ours = (listed: { pack: string }): boolean =>
    listed.pack === pack || factoryPackKey(listed.pack) === key;
  return {
    overview: listing.overviews.find(ours) ?? null,
    errors: listing.errors.filter(ours),
  };
}

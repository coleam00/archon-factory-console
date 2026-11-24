/** Schemas for the Software Factory section's read-only routes (`api.factory.ts`). */
import { factoryPacksSchema } from '@archon/workflows/schemas/factory-overview';
import { factoryViewsListingSchema } from '@archon/workflows/schemas/factory-view';

export const factoryViewsSchema = factoryViewsListingSchema.meta({ id: 'FactoryViews' });

export const factoryPacksResponseSchema = factoryPacksSchema.meta({ id: 'FactoryPacks' });

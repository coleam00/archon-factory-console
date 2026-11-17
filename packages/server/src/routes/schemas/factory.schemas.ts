/** Schemas for the Software Factory section's read-only routes (`api.factory.ts`). */
import { factoryItemsPageSchema } from '@archon/workflows/factory-items';
import { factoryViewsListingSchema } from '@archon/workflows/schemas/factory-view';

export const factoryViewsSchema = factoryViewsListingSchema.meta({ id: 'FactoryViews' });

export const factoryItemsPageResponseSchema = factoryItemsPageSchema.meta({
  id: 'FactoryItemsPage',
});

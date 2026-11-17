/** Schemas for the Software Factory section's read-only routes (`api.factory.ts`). */
import { factoryItemDetailSchema, factoryItemsPageSchema } from '@archon/workflows/factory-items';
import { factoryWorkflowSchema as factoryWorkflowShape } from '@archon/workflows/schemas/factory-steps';
import { factoryViewsListingSchema } from '@archon/workflows/schemas/factory-view';

export const factoryViewsSchema = factoryViewsListingSchema.meta({ id: 'FactoryViews' });

export const factoryItemsPageResponseSchema = factoryItemsPageSchema.meta({
  id: 'FactoryItemsPage',
});

export const factoryWorkflowSchema = factoryWorkflowShape.meta({ id: 'FactoryWorkflow' });

export const factoryItemDetailResponseSchema = factoryItemDetailSchema.meta({
  id: 'FactoryItemDetail',
});

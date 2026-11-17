/** Schemas for the Software Factory section's read-only routes (`api.factory.ts`). */
import { factoryWorkflowSchema as factoryWorkflowShape } from '@archon/workflows/schemas/factory-steps';
import { factoryViewsListingSchema } from '@archon/workflows/schemas/factory-view';

export const factoryViewsSchema = factoryViewsListingSchema.meta({ id: 'FactoryViews' });
export const factoryWorkflowSchema = factoryWorkflowShape.meta({ id: 'FactoryWorkflow' });

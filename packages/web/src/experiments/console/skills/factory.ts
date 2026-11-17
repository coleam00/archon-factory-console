import type { QueryParams } from '../lib/api-types';
import { requestJson } from '../lib/http';
import type { components } from '@/lib/api.generated';

export type FactoryViews = components['schemas']['FactoryViews'];

/** The factory views that apply to one project, and declarations that failed, with their files. */
export async function getFactoryViews(
  opts: QueryParams<'/api/factory/views', 'get'>
): Promise<FactoryViews> {
  return requestJson('/api/factory/views', 'get', { query: opts });
}

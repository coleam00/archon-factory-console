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

export type FactoryWorkflow = components['schemas']['FactoryWorkflow'];

/** One workflow a project's factory view names: its steps, loop groups and includes. */
export async function getFactoryWorkflow(
  opts: QueryParams<'/api/factory/workflow', 'get'>
): Promise<FactoryWorkflow> {
  return requestJson('/api/factory/workflow', 'get', { query: opts });
}

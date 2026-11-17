import type { QueryParams } from '../lib/api-types';
import { requestJson } from '../lib/http';
import type { components } from '@/lib/api.generated';

export type FactoryViews = components['schemas']['FactoryViews'];
export type FactoryProgress = components['schemas']['FactoryProgress'];
export type FactoryItemDetail = components['schemas']['FactoryItemDetail'];
/**
 * One item's engine read (`GET /api/items/window`) joined with its progress
 * (`GET /api/factory/progress`), null when the server could not derive it: the shape the
 * item detail's `item` has, which is the item read's schema extended with `progress`.
 */
export type FactoryItem = FactoryItemDetail['item'];
/** What the board needs of one item beyond its read. */
export type FactoryItemProgress = NonNullable<FactoryItem['progress']>;

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

/** The board progress of the items `keys` names, by key; a key with no item is left out. */
export async function getFactoryProgress(
  opts: QueryParams<'/api/factory/progress', 'get'>
): Promise<FactoryProgress> {
  return requestJson('/api/factory/progress', 'get', { query: opts });
}

/** One item, its read and progress, with each of its runs' timeline facts. */
export async function getFactoryItem(
  opts: QueryParams<'/api/factory/item', 'get'>
): Promise<FactoryItemDetail> {
  return requestJson('/api/factory/item', 'get', { query: opts });
}

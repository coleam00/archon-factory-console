import type { QueryParams } from '../lib/api-types';
import { requestJson } from '../lib/http';
import type { components } from '@/lib/api.generated';

export type FactoryViews = components['schemas']['FactoryViews'];
export type FactoryItemsPage = components['schemas']['FactoryItemsPage'];
export type FactoryItemDetail = components['schemas']['FactoryItemDetail'];
/** One item's engine read plus its progress, as a page entry and the item read carry it. */
export type FactoryItem = FactoryItemDetail['item'];

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

/** A page of one project's items, newest activity first, each with its progress on the board. */
export async function listFactoryItems(
  opts: QueryParams<'/api/factory/items', 'get'>
): Promise<FactoryItemsPage> {
  return requestJson('/api/factory/items', 'get', { query: opts });
}

/** One item, read as a page entry is, with each of its runs' timeline facts. */
export async function getFactoryItem(
  opts: QueryParams<'/api/factory/item', 'get'>
): Promise<FactoryItemDetail> {
  return requestJson('/api/factory/item', 'get', { query: opts });
}

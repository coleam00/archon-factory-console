import type { components, paths } from '@/lib/api.generated';
import type { QueryParams } from '../lib/api-types';
import { HttpError, requestJson } from '../lib/http';
import { toProject, type Project } from '../primitives/project';

/*
 * The factory's reads. They call the console's typed request directly, so the factory needs
 * nothing of the console's skills beyond what Archon dev has.
 */

type Init = { signal?: AbortSignal };

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
export type FactoryWorkflow = components['schemas']['FactoryWorkflow'];
export type FactoryPacksRead = components['schemas']['FactoryPacks'];
export type FactoryDiscoveries = components['schemas']['FactoryDiscoveries'];
export type FactoryPackSettings = components['schemas']['FactoryPackSettings'];
export type ItemWindow = components['schemas']['ItemWindow'];
/** One item read whole, as `GET /api/items` and a window page return it. */
export type ItemRead = components['schemas']['ItemRead'];

/** The project a Factory page belongs to, read so a slow read can be abandoned. */
export async function getFactoryProject(id: string, init: Init = {}): Promise<Project> {
  const raw = await requestJson('/api/codebases/{id}', 'get', {
    params: { id },
    signal: init.signal,
  });
  return toProject(raw);
}

/** The factory views that apply to one project, and declarations that failed, with their files. */
export async function getFactoryViews(
  opts: QueryParams<'/api/factory/views', 'get'>,
  init: Init = {}
): Promise<FactoryViews> {
  return requestJson('/api/factory/views', 'get', { query: opts, signal: init.signal });
}

/** One workflow a project's factory view names: its steps, loop groups and includes. */
export async function getFactoryWorkflow(
  opts: QueryParams<'/api/factory/workflow', 'get'>,
  init: Init = {}
): Promise<FactoryWorkflow> {
  return requestJson('/api/factory/workflow', 'get', { query: opts, signal: init.signal });
}

/** The server's `{ error, detail? }` refusal, when the body is one. */
function refusal(body: string): { error?: string; detail?: string } {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const { error, detail } = parsed as Record<string, unknown>;
    return {
      ...(typeof error === 'string' ? { error } : {}),
      ...(typeof detail === 'string' ? { detail } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * The board progress of the items `keys` names, by key; a key with no item is left out. The
 * server reads `keys` repeated once per item, which the console's request helper cannot send
 * (it joins an array into one value), so this builds the query itself and fails the way that
 * helper does.
 */
export async function getFactoryProgress(
  opts: { codebaseId: string; keys: string[] },
  init: Init = {}
): Promise<FactoryProgress> {
  const query = new URLSearchParams({ codebaseId: opts.codebaseId });
  for (const key of opts.keys) query.append('keys', key);
  const path = '/api/factory/progress' satisfies keyof paths;
  const res = await fetch(`${path}?${query.toString()}`, {
    credentials: 'same-origin',
    signal: init.signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const { error, detail } = refusal(body);
    const snippet = body.length > 200 ? `${body.slice(0, 200)}...` : body;
    throw new HttpError(res.status, path, snippet, error, detail);
  }
  return (await res.json()) as FactoryProgress;
}

/** One item, its read and progress, with each of its runs' timeline facts. */
export async function getFactoryItem(
  opts: QueryParams<'/api/factory/item', 'get'>,
  init: Init = {}
): Promise<FactoryItemDetail> {
  return requestJson('/api/factory/item', 'get', { query: opts, signal: init.signal });
}

/** Every pack with a factory overview file, which overview its page shows, and the projects that run it. */
export async function getFactoryPacks(init: Init = {}): Promise<FactoryPacksRead> {
  return requestJson('/api/factory/packs', 'get', { signal: init.signal });
}

/** What the project's discoveries drains decided to file, held and dropped. */
export async function getFactoryDiscoveries(
  opts: QueryParams<'/api/factory/discoveries', 'get'>,
  init: Init = {}
): Promise<FactoryDiscoveries> {
  return requestJson('/api/factory/discoveries', 'get', { query: opts, signal: init.signal });
}

/** A pack's declared settings, in its order, and what each project that runs it sets. */
export async function getFactoryPackSettings(
  opts: QueryParams<'/api/factory/pack-settings', 'get'>,
  init: Init = {}
): Promise<FactoryPackSettings> {
  return requestJson('/api/factory/pack-settings', 'get', { query: opts, signal: init.signal });
}

/**
 * A page of a project's items with a run started in a window, each read whole. A first page
 * names its window (`since`, `until`); a later one names only the `after` cursor it follows.
 */
export async function listItemWindow(
  opts: QueryParams<'/api/items/window', 'get'>,
  init: Init = {}
): Promise<ItemWindow> {
  return requestJson('/api/items/window', 'get', { query: opts, signal: init.signal });
}

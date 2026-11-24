import type { components, paths } from '@/lib/api.generated';
import type { QueryParams } from '../lib/api-types';
import { HttpError, requestJson } from '../lib/http';
import { toProject, type Project } from '../primitives/project';

/*
 * The factory's reads: Archon's generic reads and the view file. They call the console's typed
 * request directly, so the factory needs nothing of the console's skills beyond what Archon
 * dev has.
 */

type Init = { signal?: AbortSignal };

export type FactoryViews = components['schemas']['FactoryViews'];
export type FactoryPacksRead = components['schemas']['FactoryPacks'];
export type ItemWindow = components['schemas']['ItemWindow'];
/** One item read whole, as `GET /api/items` and a window page return it. */
export type ItemRead = components['schemas']['ItemRead'];
export type RunRecord = components['schemas']['RunRecord'];
export type RunRecords = components['schemas']['RunRecords'];
export type ForgeSubjects = components['schemas']['ForgeSubjects'];
export type RunDetail = components['schemas']['WorkflowRunDetail'];
export type {
  FactoryItem,
  FactoryItemDetail,
  FactoryItemProgress,
  FactoryItemRun,
} from './lib/progress-types';

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

/** Every pack with a factory overview file, which overview its page shows, and the projects that run it. */
export async function getFactoryPacks(init: Init = {}): Promise<FactoryPacksRead> {
  return requestJson('/api/factory/packs', 'get', { signal: init.signal });
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

/** One item of a project, read whole; a 404 when the project has no item under the key. */
export async function getItem(
  opts: QueryParams<'/api/items', 'get'>,
  init: Init = {}
): Promise<ItemRead> {
  return requestJson('/api/items', 'get', { query: opts, signal: init.signal });
}

/** One run with its events (provider events aside). */
export async function getRunDetail(runId: string, init: Init = {}): Promise<RunDetail> {
  return requestJson('/api/workflows/runs/{runId}', 'get', {
    params: { runId },
    signal: init.signal,
  });
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
 * A GET whose query repeats a parameter once per value, which the console's request helper
 * cannot send (it joins an array into one value), so this builds the query itself and fails
 * the way that helper does.
 */
async function getRepeated<T>(path: keyof paths, query: URLSearchParams, init: Init): Promise<T> {
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
  return (await res.json()) as T;
}

/** Which top-level fields of each node's output and of the result a records read keeps. */
export interface RecordFields {
  output: readonly string[];
  /** Null keeps the result whole. */
  result: readonly string[] | null;
}

/** The records of up to 100 runs, without their events (`GET /api/workflows/runs/records`). */
export async function getRunRecords(
  ids: readonly string[],
  fields: RecordFields,
  init: Init = {}
): Promise<RunRecords> {
  const query = new URLSearchParams();
  for (const id of ids) query.append('runId', id);
  for (const key of fields.output) query.append('outputKey', key);
  for (const key of fields.result ?? []) query.append('resultKey', key);
  return getRepeated('/api/workflows/runs/records', query, init);
}

/** What the forge asks about: issue numbers, changes named at a URL, and changes named by run only. */
export interface ForgeQuery {
  codebaseId: string;
  issues: readonly number[];
  changes: readonly { run: string; url: string }[];
  branchRuns: readonly string[];
}

/** What the project's forge says of some issues and delivered changes (`GET /api/forge/subjects`). */
export async function getForgeSubjects(opts: ForgeQuery, init: Init = {}): Promise<ForgeSubjects> {
  const query = new URLSearchParams({ codebaseId: opts.codebaseId });
  for (const issue of opts.issues) query.append('issue', String(issue));
  for (const change of opts.changes) {
    query.append('changeRun', change.run);
    query.append('changeUrl', change.url);
  }
  for (const run of opts.branchRuns) query.append('branchRun', run);
  return getRepeated('/api/forge/subjects', query, init);
}

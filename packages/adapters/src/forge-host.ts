/**
 * A host's own reach into the forge seam: where it finds forge plugins and config, and the
 * one read the console needs, whether a change merged. The CLI's `archon forge` and the
 * server both resolve plugins through here, so they never answer from different plugins.
 *
 * Imports only `@archon/forge` and `@archon/paths`, never this package's index, so the CLI
 * can load it without the chat adapters.
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { BUNDLED_IS_BINARY, getPluginsPath } from '@archon/paths';
import { getArchonConfigPath } from '@archon/paths/archon-paths';
import { getSourceGithubForgeEntry } from '@archon/paths/source-tree-paths';
import type { SourcePlugin } from '@archon/forge/discovery';
import { dispatchForge } from '@archon/forge/dispatch';
import {
  type ForgeRequest,
  type ForgeResponse,
  forgeOperationAuditSchema,
  forgePrRecordSchema,
} from '@archon/forge/operations';
import { type ForgePluginConfig, forgePluginConfigSchema } from '@archon/forge/plugin-config';
import type { PrRef } from '@archon/forge';

/** The `forge:` section of an Archon config file; `{}` when the file or section is absent. */
export async function readForgeConfig(configPath: string): Promise<unknown> {
  let source: string;
  try {
    source = await readFile(configPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
  const config: unknown = Bun.YAML.parse(source);
  if (config === null) return {};
  if (typeof config !== 'object' || Array.isArray(config))
    throw new Error('Archon config must be an object');
  return 'forge' in config ? config.forge : {};
}

/**
 * Release binaries carry no forge plugin and load only installed executables. Source
 * checkouts and Docker run the GitHub plugin from this checkout, as they run the
 * maintained providers, so the plugin is never older than the host that calls it.
 */
export function sourceForgePlugins(isBinary: boolean = BUNDLED_IS_BINARY): SourcePlugin[] {
  if (isBinary) return [];
  return [
    {
      name: 'github',
      command: process.execPath,
      args: ['--no-env-file', getSourceGithubForgeEntry()],
    },
  ];
}

export interface ForgeHostDiscovery {
  config: ForgePluginConfig;
  env: NodeJS.ProcessEnv;
  pluginsDir: string;
  sourcePlugins: readonly SourcePlugin[];
}

/**
 * Where a host under `archonHome` finds plugins: its config's `forge:` section, the
 * trusted plugin directory `archon plugin add` writes, and the source plugins.
 */
export async function forgeHostDiscovery(
  archonHome: string,
  env: NodeJS.ProcessEnv
): Promise<ForgeHostDiscovery> {
  return {
    config: forgePluginConfigSchema.parse(await readForgeConfig(getArchonConfigPath(archonHome))),
    env,
    pluginsDir: getPluginsPath(archonHome),
    sourcePlugins: sourceForgePlugins(),
  };
}

/**
 * The pull request a forge audit row recorded for `url`: the latest successful operation
 * whose result carries that pull request's record. The forge said which PR the URL is,
 * so nothing here parses the URL.
 */
export function prRefFromAudits(url: string, audits: readonly unknown[]): PrRef | null {
  for (const row of [...audits].reverse()) {
    const audit = forgeOperationAuditSchema.safeParse(row);
    if (!audit.success || !audit.data.result.ok) continue;
    const value: unknown = audit.data.result.result.value;
    if (typeof value !== 'object' || value === null || !('pr' in value)) continue;
    const pr = forgePrRecordSchema.safeParse(value.pr);
    if (pr.success && pr.data.url === url) return { repo: pr.data.repo, number: pr.data.number };
  }
  return null;
}

export interface ChangeMergeState {
  merged: boolean | 'unknown';
  mergedAt: string | null;
  /** The pull request's number when the forge named it; null when it could not. */
  number: number | null;
  /** Why the state is unknown; absent when the forge answered. */
  reason?: string;
}

type PrView = NonNullable<
  Extract<Extract<ForgeResponse, { ok: true }>['result'], { op: 'pr.view' }>['value']
>;
type Ask = (request: ForgeRequest) => Promise<ForgeResponse>;
/** A pull request the forge showed, or why it could not be found. */
type Found = { view: PrView } | { reason: string };

const unknown = (reason: string): ChangeMergeState => ({
  merged: 'unknown',
  mergedAt: null,
  number: null,
  reason,
});
const failed = (response: Extract<ForgeResponse, { ok: false }>): string =>
  `${response.error.kind}: ${response.error.message}`;

/** The pull request `ref` names, by number. */
async function viewByNumber(ask: Ask, ref: PrRef): Promise<Found> {
  const response = await ask({
    op: 'pr.view',
    operationId: randomUUID(),
    selector: { kind: 'number', ref },
  });
  if (!response.ok) return { reason: failed(response) };
  if (response.result.op !== 'pr.view' || response.result.value === null)
    return { reason: 'the forge found no such pull request' };
  return { view: response.result.value };
}

/**
 * The pull request opened from one of `branches` (the item's runs' recorded branches,
 * newest first) whose URL is `url`, in any state. The repository is the one the forge
 * resolves `url` to; a branch with no pull request, or one whose URL differs, is passed
 * over, and a forge failure ends the search as unknown rather than as not found.
 */
async function viewByBranch(ask: Ask, url: string, branches: readonly string[]): Promise<Found> {
  if (branches.length === 0) return { reason: 'no forge record or run branch names this change' };
  const resolved = await ask({ op: 'resolve', operationId: randomUUID(), remote: url, web: true });
  if (!resolved.ok) return { reason: failed(resolved) };
  if (resolved.result.op !== 'resolve' || resolved.result.value.kind !== 'resolved')
    return { reason: 'no forge plugin resolves this change' };
  const repo = resolved.result.value.repo;
  for (const head of branches) {
    const response = await ask({
      op: 'pr.view',
      operationId: randomUUID(),
      selector: { kind: 'head', repo, headRepo: repo, head, state: 'any' },
    });
    if (!response.ok) return { reason: failed(response) };
    if (response.result.op !== 'pr.view') return { reason: 'the forge answered another operation' };
    const view = response.result.value;
    if (view?.pr.url === url) return { view };
  }
  return { reason: "no pull request on the item's run branches is this change" };
}

/**
 * Whether the change at `url` merged, asked of its forge with `pr.view`. `audits` are the
 * forge audit rows of the run that recorded the change; when one names its pull request,
 * that is asked by number. When none does (an earlier run opened it), `branches` gives the
 * item's runs' recorded branches, newest first, read only then, and the pull request on
 * one of them whose URL is the change is taken. Never throws: a failure is `unknown` with
 * its reason. Nothing is audited, as nothing here belongs to a run.
 */
export async function changeMergeState(
  url: string,
  audits: readonly unknown[],
  branches: () => Promise<readonly string[]>,
  options: { archonHome: string; env: NodeJS.ProcessEnv; dispatch?: typeof dispatchForge }
): Promise<ChangeMergeState> {
  try {
    const discovery = await forgeHostDiscovery(options.archonHome, options.env);
    const ask: Ask = async request =>
      (
        await (options.dispatch ?? dispatchForge)(request, {
          ...discovery,
          credentialEnv: options.env,
        })
      ).response;
    const ref = prRefFromAudits(url, audits);
    const found =
      ref === null ? await viewByBranch(ask, url, await branches()) : await viewByNumber(ask, ref);
    if ('reason' in found) return unknown(found.reason);
    const { pr, timestamps } = found.view;
    return pr.state === 'merged'
      ? { merged: true, mergedAt: timestamps?.merged_at ?? null, number: pr.number }
      : { merged: false, mergedAt: null, number: pr.number };
  } catch (error) {
    return unknown((error as Error).message);
  }
}

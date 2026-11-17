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
import { forgeOperationAuditSchema, forgePrRecordSchema } from '@archon/forge/operations';
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
  /** Why the state is unknown; absent when the forge answered. */
  reason?: string;
}

/**
 * Whether the change at `url` merged, asked of its forge with `pr.view`. `audits` are the
 * forge audit rows of the run that recorded the change, which name its pull request.
 * Never throws: a failure is `unknown` with its reason. Nothing is audited, as nothing
 * here belongs to a run.
 */
export async function changeMergeState(
  url: string,
  audits: readonly unknown[],
  options: { archonHome: string; env: NodeJS.ProcessEnv; dispatch?: typeof dispatchForge }
): Promise<ChangeMergeState> {
  const ref = prRefFromAudits(url, audits);
  if (ref === null)
    return { merged: 'unknown', mergedAt: null, reason: 'no forge record names this change' };
  try {
    const discovery = await forgeHostDiscovery(options.archonHome, options.env);
    const { response } = await (options.dispatch ?? dispatchForge)(
      { op: 'pr.view', operationId: randomUUID(), selector: { kind: 'number', ref } },
      { ...discovery, credentialEnv: options.env }
    );
    if (!response.ok)
      return {
        merged: 'unknown',
        mergedAt: null,
        reason: `${response.error.kind}: ${response.error.message}`,
      };
    if (response.result.op !== 'pr.view' || response.result.value === null)
      return { merged: 'unknown', mergedAt: null, reason: 'the forge found no such pull request' };
    const { pr, timestamps } = response.result.value;
    return pr.state === 'merged'
      ? { merged: true, mergedAt: timestamps?.merged_at ?? null }
      : { merged: false, mergedAt: null };
  } catch (error) {
    return { merged: 'unknown', mergedAt: null, reason: (error as Error).message };
  }
}

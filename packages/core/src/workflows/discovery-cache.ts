/**
 * Live workflow discovery for a project root, kept while the files it reads stay as they were.
 * Discovery parses every workflow in reach and is most of what a pack graph read costs (over a
 * second for an install with a few packs), so a server that reads the graph on every page load
 * keeps it here (DESIGN.md, "Speed is a requirement": the graph is read once per pack copy).
 *
 * The key is a stamp of every directory and file under the roots live discovery reads
 * (`liveSourceRoots`: the project's `.archon/`, the home's workflows, commands and scripts, the
 * bundled workflows and the installed packs), plus the home's config and env files and the
 * project's configured command folder: path, modification time and size of each. Each call
 * stamps again (a few hundred `stat`s) and discovers again when anything was edited, added or
 * removed. A directory reached through a symlink is stamped, not walked into.
 *
 * Not kept: a project that is itself a pack folder (`archon-plugin.json` at its root), whose
 * whole tree discovery reads; it is discovered on every call. A discovery that rejects is not
 * kept either.
 */
import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import * as archonPaths from '@archon/paths';
import { PLUGIN_MANIFEST_FILE } from '@archon/plugin-manifest';
import type { ProviderRegistry } from '@archon/providers';
import type { WorkflowLoadResult } from '@archon/workflows/schemas/workflow';
import { discoverWorkflowsWithConfig } from '@archon/workflows/workflow-discovery';
import { liveSourceRoots } from '@archon/workflows/workflow-source';

type LoadConfig = Parameters<typeof discoverWorkflowsWithConfig>[1];

/** `path` and everything under it, one line per entry, into `out`. */
async function stampTree(path: string, out: string[]): Promise<void> {
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(path);
  } catch {
    out.push(`- ${path}`);
    return;
  }
  out.push(
    `${info.isDirectory() ? 'd' : 'f'} ${path} ${String(info.mtimeMs)} ${String(info.size)}`
  );
  if (!info.isDirectory()) return;
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  const lines = await Promise.all(
    entries.map(async entry => {
      const child: string[] = [];
      const at = join(path, entry.name);
      if (entry.isDirectory()) await stampTree(at, child);
      else {
        const s = await stat(at).catch(() => null);
        child.push(s === null ? `- ${at}` : `f ${at} ${String(s.mtimeMs)} ${String(s.size)}`);
      }
      return child;
    })
  );
  for (const child of lines) out.push(...child);
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  );
}

/** The stamp of what live discovery from `root` reads. */
async function discoveryStamp(root: string, loadConfig: LoadConfig): Promise<string> {
  const roots = liveSourceRoots(root);
  const folder = (await loadConfig(root)).commands?.folder;
  const out: string[] = [];
  for (const path of [
    join(root, '.archon'),
    ...(folder === undefined ? [] : [resolve(root, folder)]),
    roots.globalWorkflows,
    roots.globalCommands,
    roots.globalScripts,
    roots.bundledWorkflows,
    ...(roots.installed.kind === 'receipts' ? [roots.installed.pluginsDir] : []),
    archonPaths.getArchonConfigPath(),
    archonPaths.getArchonEnvPath(),
  ])
    await stampTree(path, out);
  return out.join('\n');
}

/** `discoverWorkflowsWithConfig(root)`, kept per root while its stamp is unchanged. */
export function createDiscoveryCache(
  loadConfig: LoadConfig,
  providers: ProviderRegistry
): (root: string) => Promise<WorkflowLoadResult> {
  const kept = new Map<string, { stamp: string; result: Promise<WorkflowLoadResult> }>();
  const discover = (root: string): Promise<WorkflowLoadResult> =>
    discoverWorkflowsWithConfig(root, loadConfig, providers);
  return async root => {
    if (await exists(join(root, PLUGIN_MANIFEST_FILE))) return discover(root);
    const stamp = await discoveryStamp(root, loadConfig);
    const entry = kept.get(root);
    if (entry?.stamp === stamp) return entry.result;
    const result = discover(root);
    const fresh = { stamp, result };
    kept.set(root, fresh);
    result.catch(() => {
      if (kept.get(root) === fresh) kept.delete(root);
    });
    return result;
  };
}

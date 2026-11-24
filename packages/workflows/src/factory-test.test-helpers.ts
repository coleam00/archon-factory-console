import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DEFAULT_WORKFLOW_SOURCE_CONFIG } from './workflow-source';
import type { LiveWorkflowSourceRoots } from './workflow-source/roots';

/**
 * Fresh, empty live source roots in a new temp tree `track` removes: a home and, unless
 * `project` is false, a project. Call it in `beforeEach`.
 */
export async function scratchRoots(
  track: (path: string) => string,
  prefix: string,
  { project: withProject = true } = {}
): Promise<{ root: string; project: string; roots: LiveWorkflowSourceRoots }> {
  const root = track(await mkdtemp(join(tmpdir(), prefix)));
  const project = join(root, 'project');
  const roots: LiveWorkflowSourceRoots = {
    kind: 'live',
    config: DEFAULT_WORKFLOW_SOURCE_CONFIG,
    project: withProject ? project : null,
    globalWorkflows: join(root, 'home', 'workflows'),
    globalCommands: join(root, 'home', 'commands'),
    globalScripts: join(root, 'home', 'scripts'),
    bundledWorkflows: join(root, 'bundled'),
    installed: { kind: 'receipts', pluginsDir: join(root, 'home', 'plugins') },
  };
  return { root, project, roots };
}

/** Writes `content` at `path`, its folders made; anything but text is written as JSON. */
export async function writeAt(path: string, content: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, typeof content === 'string' ? content : JSON.stringify(content));
}

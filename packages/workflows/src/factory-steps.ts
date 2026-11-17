/**
 * One workflow's steps for the console's stage and step pages (`schemas/factory-steps.ts`),
 * read from the definition the engine runs: discovery's composed workflow, with includes
 * already inlined. Loop groups and include groups come from that definition, prompts from
 * the command files the engine would load, and each step's YAML from the pack file its
 * author wrote it in. Nothing here writes.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isMap, isSeq, parseDocument, type Document, type YAMLMap } from 'yaml';
import { readComposedMeta } from './compiled-command';
import { INCLUDE_ID_SEPARATOR } from './include/inline';
import type { WorkflowDeps } from './deps';
import { resolvedBodyNodes } from './graph-plan';
import { loadCommandPrompt } from './load-command-prompt';
import { parseWhenExpression, type WhenAtom, type WhenOperator } from './when-atom';
import { unqualifiedResourceName } from './packaged-workflow';
import type { DagNode, ResolvedWorkflow } from './schemas';
import { isLoopGroupNode } from './schemas';
import type {
  FactoryStep,
  FactoryStepGroup,
  FactoryStepKind,
  FactoryWorkflow,
} from './schemas/factory-steps';
import type { WorkflowPack } from './schemas/pack-settings';
import { readPackWorkflowFolders } from './workflow-discovery/pack-layout';
import { listInstalledPacks, packDirectory } from './workflow-source/installed-packs';
import type { WorkflowSourceRoots } from './workflow-source/roots';

export interface FactoryStepsContext {
  /** The project; owns config. */
  cwd: string;
  deps: Pick<WorkflowDeps, 'loadConfig'>;
  /** Where pack and command files are read from: the project's live roots, with its settings. */
  roots: WorkflowSourceRoots;
}

/** A step found in the definition, before its prompt and YAML are read. */
interface Outlined {
  step: Omit<FactoryStep, 'prompt' | 'promptError' | 'yaml' | 'yamlError' | 'command'>;
  node: DagNode;
  /** Where the author wrote it: a pack, a workflow in it, and the id there. */
  authored: {
    pack: Pick<WorkflowPack, 'source' | 'key'> | undefined;
    workflow: string;
    id: string;
  };
}

/**
 * `workflow`'s steps and groups, for a view that names it `name`. `workflow` is the entry
 * discovery returned, so the graph is the one runs execute.
 */
export async function factoryWorkflowSteps(
  name: string,
  workflow: ResolvedWorkflow,
  context: FactoryStepsContext
): Promise<FactoryWorkflow> {
  const { steps, groups } = outlineSteps(workflow);
  const files = new PackFiles(context.roots);
  const read: FactoryStep[] = [];
  for (const outlined of steps) {
    const block = await files.authoredBlock(outlined.authored);
    read.push({
      ...outlined.step,
      ...(await stepPrompt(outlined.node, context)),
      command: stepCommand(outlined.node, block.command),
      yaml: block.yaml,
      yamlError: block.yamlError,
    });
  }
  return { name, runName: workflow.name, steps: read, groups };
}

/**
 * Walk the composed definition into steps and groups. Pure. A loop group's body is keyed
 * `<loop>.<node>`, as run events name it. A node the engine marked as composed belongs to
 * the include groups its id names: `review__review` sits in the group of include `review`.
 *
 * The engine records only the innermost workflow a composed node came from, so the nesting
 * comes from the id. An id authored inside an included workflow that itself contains `__`
 * therefore draws one include frame too many. A node authored at the top keeps its id whole.
 */
function outlineSteps(workflow: ResolvedWorkflow): {
  steps: Outlined[];
  groups: FactoryStepGroup[];
} {
  const outline = new Outline(workflow);
  outline.walk(workflow.nodes, '', null);
  return outline.result();
}

class Outline {
  private readonly steps: Outlined[] = [];
  private readonly groups: FactoryStepGroup[] = [];
  private readonly known = new Set<string>();
  // An include group is named for the workflow its direct members came from.
  private readonly origins = new Map<string, string>();
  // Step keys and loop ids to the ids their authors wrote, for naming a `when:`'s steps.
  private readonly labels = new Map<string, string>();
  // The key prefix (`rounds.`) a step or loop's `when:` names its sibling steps under.
  private readonly scopes = new Map<string, string>();

  constructor(private readonly workflow: ResolvedWorkflow) {}

  walk(nodes: readonly DagNode[], prefix: string, parent: string | null): void {
    for (const node of nodes) {
      const meta = readComposedMeta(node);
      const segments = meta === undefined ? [node.id] : node.id.split(INCLUDE_ID_SEPARATOR);
      const id = segments.pop() ?? node.id;
      const group = this.openIncludes(segments, prefix, parent);
      if (meta !== undefined && group !== parent && group !== null)
        this.origins.set(group, localWorkflowName(meta.origin));
      const key = prefix + node.id;
      const dependsOn = (node.depends_on ?? []).map(dependency => prefix + dependency);
      this.labels.set(key, id);
      this.scopes.set(key, prefix);
      if (isLoopGroupNode(node)) {
        this.known.add(key);
        this.groups.push({
          id: key,
          kind: 'loop',
          parent: group,
          label: id,
          maxRounds: node.loop_group.max_iterations,
          when: node.when ?? null,
          whenLabel: null,
          dependsOn,
        });
        this.walk(resolvedBodyNodes(node.loop_group), `${key}.`, key);
      } else {
        this.addStep(node, { key, id, group, dependsOn }, meta);
      }
    }
  }

  result(): { steps: Outlined[]; groups: FactoryStepGroup[] } {
    return {
      steps: this.steps.map(outlined => ({
        ...outlined,
        step: {
          ...outlined.step,
          whenLabel: this.whenLabel(outlined.step.key, outlined.step.when),
        },
      })),
      groups: this.groups.map(group =>
        group.kind === 'include'
          ? { ...group, label: this.origins.get(group.id) ?? group.label }
          : { ...group, whenLabel: this.whenLabel(group.id, group.when) }
      ),
    };
  }

  /** `when` in short, its steps named as their authors wrote them. */
  private whenLabel(key: string, when: string | null): string | null {
    if (when === null) return null;
    const prefix = this.scopes.get(key) ?? '';
    return shortCondition(
      when,
      nodeId => this.labels.get(prefix + nodeId) ?? this.labels.get(nodeId) ?? nodeId
    );
  }

  /** The include groups `segments` name under `parent`, opened once each; returns the innermost. */
  private openIncludes(segments: string[], prefix: string, parent: string | null): string | null {
    let group = parent;
    let path = '';
    for (const segment of segments) {
      path = path === '' ? segment : `${path}${INCLUDE_ID_SEPARATOR}${segment}`;
      const groupId = prefix + path;
      if (!this.known.has(groupId)) {
        this.known.add(groupId);
        this.groups.push(includeGroup(groupId, group, segment));
      }
      group = groupId;
    }
    return group;
  }

  private addStep(
    node: DagNode,
    at: { key: string; id: string; group: string | null; dependsOn: string[] },
    meta: ReturnType<typeof readComposedMeta>
  ): void {
    this.steps.push({
      step: {
        key: at.key,
        label: at.id,
        group: at.group,
        dependsOn: at.dependsOn,
        kind: stepKind(node),
        includedFrom: meta === undefined ? null : localWorkflowName(meta.origin),
        model: declaredModel(node),
        when: node.when ?? null,
        whenLabel: null,
      },
      node,
      authored:
        meta === undefined
          ? { pack: this.workflow.pack, workflow: this.workflow.name, id: node.id }
          : { pack: meta.pack, workflow: meta.origin, id: at.id },
    });
  }
}

function includeGroup(id: string, parent: string | null, segment: string): FactoryStepGroup {
  return {
    id,
    kind: 'include',
    parent,
    label: segment,
    maxRounds: null,
    when: null,
    whenLabel: null,
    dependsOn: [],
  };
}

const OPERATOR_WORDS: Record<WhenOperator, string> = {
  '==': '=',
  '!=': '≠',
  '<=': '≤',
  '>=': '≥',
  '<': '<',
  '>': '>',
};

/**
 * A `when:` in short, through the engine's own parser: each comparison as the step it reads
 * (named by `name`), the operator and the value, joined with `and` and `or` as written, such
 * as `if verdict = return`. The field a comparison reads is left out: the full expression
 * says it. Null when the parser does not take the expression.
 */
export function shortCondition(when: string, name: (nodeId: string) => string): string | null {
  const clauses = parseWhenExpression(when, true);
  if (clauses === null || clauses.length === 0) return null;
  const atom = ({ ref, operator, expected }: WhenAtom): string =>
    `${ref.kind === 'input' ? ref.name : name(ref.nodeId)} ${OPERATOR_WORDS[operator]} ${
      expected === '' ? 'empty' : expected
    }`;
  return `if ${clauses.map(atoms => atoms.map(atom).join(' and ')).join(' or ')}`;
}

/**
 * An installed workflow is `owner/name:workflow` (`installedWorkflowName`); inside its pack
 * it is `workflow`. A folder pack's workflow has no qualifier and passes through.
 */
function localWorkflowName(name: string): string {
  return name.slice(name.lastIndexOf(':') + 1);
}

function stepKind(node: DagNode): FactoryStepKind {
  switch (node.kind) {
    case 'agent':
      return 'agent';
    case 'exec':
      return node.runtime === 'sh' ? 'bash' : 'script';
    case 'loop':
      return 'loop';
    case 'gate':
      return 'approval';
    case 'wait':
      return 'wait';
    case 'loop_group':
    case 'halt':
    case 'workflow':
    case 'compose_fan_out':
      return 'other';
  }
}

function declaredModel(node: DagNode): string[] | null {
  const model = (node as { model?: string | readonly string[] }).model;
  if (model === undefined) return null;
  return typeof model === 'string' ? [model] : [...model];
}

/** The command file a step runs: the engine's reference, else the author's `command:`. */
function stepCommand(node: DagNode, authored: string | null): string | null {
  if (node.kind === 'agent' && node.source.kind === 'command')
    return unqualifiedResourceName(node.source.name);
  if (node.kind === 'loop' && node.loop.command !== undefined)
    return unqualifiedResourceName(node.loop.command);
  // An included command step arrives with its command file's text already inlined.
  return authored;
}

/** The prompt an agent or loop step runs: inline text, or its command file's. */
async function stepPrompt(
  node: DagNode,
  context: FactoryStepsContext
): Promise<Pick<FactoryStep, 'prompt' | 'promptError'>> {
  let command: string | undefined;
  if (node.kind === 'agent') {
    if (node.source.kind === 'inline') return { prompt: node.source.prompt, promptError: null };
    command = node.source.name;
  } else if (node.kind === 'loop') {
    if (node.loop.prompt !== undefined) return { prompt: node.loop.prompt, promptError: null };
    command = node.loop.command;
  }
  if (command === undefined) return { prompt: null, promptError: null };
  const loaded = await loadCommandPrompt(
    context.deps,
    context.cwd,
    command,
    undefined, // the roots carry the project's command folder
    context.roots
  );
  return loaded.success
    ? { prompt: loaded.content, promptError: null }
    : { prompt: null, promptError: loaded.message };
}

interface AuthoredBlock {
  yaml: string | null;
  yamlError: string | null;
  /** The block's `command:` (or `loop.command`), as written. */
  command: string | null;
}

/** A pack's workflow files, read once per call. */
class PackFiles {
  private readonly documents = new Map<string, Promise<ParsedFile | { error: string }>>();

  constructor(private readonly roots: WorkflowSourceRoots) {}

  async authoredBlock(authored: Outlined['authored']): Promise<AuthoredBlock> {
    const missing = (yamlError: string): AuthoredBlock => ({
      yaml: null,
      yamlError,
      command: null,
    });
    if (authored.pack === undefined)
      return missing(`${authored.workflow} was not loaded from a pack, so its file is not known.`);
    const cacheKey = `${authored.pack.source}:${authored.pack.key}:${authored.workflow}`;
    let file = this.documents.get(cacheKey);
    if (file === undefined) {
      file = this.readWorkflowFile(authored.pack, localWorkflowName(authored.workflow));
      this.documents.set(cacheKey, file);
    }
    const read = await file;
    if ('error' in read) return missing(read.error);
    const found = findAuthoredNode(read.document.get('nodes'), authored.id);
    if (found === undefined) return missing(`This step's YAML was not found in ${read.path}.`);
    return { yaml: sliceBlock(read.text, found), yamlError: null, command: authoredCommand(found) };
  }

  /**
   * The file `name` was loaded from in `pack`. An installed pack names its entrypoints'
   * files in its manifest; any other workflow in a pack is the folder whose YAML declares
   * that `name:`.
   */
  private async readWorkflowFile(
    pack: Pick<WorkflowPack, 'source' | 'key'>,
    name: string
  ): Promise<ParsedFile | { error: string }> {
    let dir: string | null;
    if (pack.source === 'installed') {
      const installed = (await listInstalledPacks(this.roots.installed)).packs.find(
        candidate => candidate.key === pack.key
      );
      if (installed === undefined) return { error: `Installed pack ${pack.key} is not readable.` };
      const entry = installed.manifest.entrypoints[name];
      if (entry !== undefined) return parseFile(join(installed.dir, entry));
      dir = installed.dir;
    } else {
      dir = await packDirectory(this.roots, pack);
    }
    if (dir === null) return { error: `Pack ${pack.key} has no files here.` };
    const listing = await readPackWorkflowFolders(dir, pack.key);
    if ('error' in listing) return { error: listing.error.error };
    for (const folder of listing.folders) {
      if (folder.kind !== 'workflow') continue;
      const parsed = await parseFile(join(folder.path, folder.filename));
      if (!('error' in parsed) && parsed.document.get('name') === name) return parsed;
    }
    return { error: `No workflow file in pack ${pack.key} declares the workflow ${name}.` };
  }
}

interface ParsedFile {
  path: string;
  text: string;
  document: Document.Parsed;
}

async function parseFile(path: string): Promise<ParsedFile | { error: string }> {
  try {
    // A checkout on Windows may hold CRLF; the block is sliced by offsets into this text.
    const text = (await readFile(path, 'utf8')).replaceAll('\r\n', '\n');
    return { path, text, document: parseDocument(text) };
  } catch (error) {
    return { error: `${path} could not be read: ${(error as Error).message}` };
  }
}

/** The node mapping with `id`, searching loop group bodies too. */
function findAuthoredNode(nodes: unknown, id: string): YAMLMap | undefined {
  if (!isSeq(nodes)) return undefined;
  for (const item of nodes.items) {
    if (!isMap(item)) continue;
    if (item.get('id') === id) return item;
    const loopGroup = item.get('loop_group');
    const inner = isMap(loopGroup) ? findAuthoredNode(loopGroup.get('nodes'), id) : undefined;
    if (inner !== undefined) return inner;
  }
  return undefined;
}

function authoredCommand(node: YAMLMap): string | null {
  const command = node.get('command');
  if (typeof command === 'string') return command;
  const loop = node.get('loop');
  const loopCommand = isMap(loop) ? loop.get('command') : undefined;
  return typeof loopCommand === 'string' ? loopCommand : null;
}

/** The node's text as written, its indentation removed. */
function sliceBlock(text: string, node: YAMLMap): string {
  const [start, end] = node.range ?? [0, 0];
  const column = start - (text.lastIndexOf('\n', start - 1) + 1);
  return text
    .slice(start, end)
    .trimEnd()
    .split('\n')
    .map((line, index) => (index === 0 ? line : line.slice(Math.min(column, indentOf(line)))))
    .join('\n');
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

import { readFileSync, readdirSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import ts from 'typescript';

/**
 * The factory console is an addition to Archon's Console, not a change to it: factory web code
 * lives under `experiments/console/factory/`, and nothing else in `packages/web/src` imports it
 * except the files that mount it (docs/factory-console/ENGINEERING.md, "Scope of a change").
 * Every other Console file stays as it is on Archon dev.
 */

const ROOT = resolve(import.meta.dir, '..');
const WEB_SRC = 'packages/web/src';
export const FACTORY_DIR = 'experiments/console/factory';

/**
 * The files that may import from the factory, relative to `packages/web/src`: the route mount,
 * the sidebar's Factory entry, and the project tabs' Factory tab.
 */
export const ALLOWED_IMPORTERS: readonly string[] = [
  'experiments/console/ConsoleApp.tsx',
  'experiments/console/components/ProjectRail.tsx',
  'experiments/console/components/ProjectViewTabs.tsx',
];

export interface SourceFile {
  /** Relative to `packages/web/src`, with forward slashes. */
  path: string;
  text: string;
}

const inFactory = (path: string): boolean =>
  path === FACTORY_DIR || path.startsWith(`${FACTORY_DIR}/`);

/** Where a specifier lands, relative to `packages/web/src`; undefined for a package import. */
function target(importer: string, specifier: string): string | undefined {
  if (specifier.startsWith('@/')) return posix.normalize(specifier.slice(2));
  if (specifier.startsWith('.')) return posix.join(posix.dirname(importer), specifier);
  return undefined;
}

/**
 * Every import of factory code from a file that may not have one, as `path:line: specifier`.
 * Reads static imports, `export ... from`, type imports and `import()`.
 */
export function factoryImportViolations(files: readonly SourceFile[]): string[] {
  const violations: string[] = [];
  for (const { path, text } of files) {
    if (inFactory(path) || ALLOWED_IMPORTERS.includes(path)) continue;
    const { importedFiles } = ts.preProcessFile(text, true, true);
    for (const { fileName, pos } of importedFiles) {
      const landed = target(path, fileName);
      if (landed === undefined || !inFactory(landed)) continue;
      const line = text.slice(0, pos).split('\n').length;
      violations.push(`${WEB_SRC}/${path}:${line.toString()}: ${fileName}`);
    }
  }
  return violations;
}

function sourceFiles(dir: string, rel = ''): SourceFile[] {
  const files: SourceFile[] = [];
  for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const path = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      if (path !== FACTORY_DIR) files.push(...sourceFiles(dir, path));
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push({ path, text: readFileSync(join(dir, path), 'utf8') });
    }
  }
  return files;
}

if (import.meta.main) {
  const violations = factoryImportViolations(sourceFiles(join(ROOT, WEB_SRC)));
  if (violations.length > 0) {
    console.error(
      `Only ${ALLOWED_IMPORTERS.join(', ')} may import from ${FACTORY_DIR}/ (docs/factory-console/ENGINEERING.md):`
    );
    for (const violation of violations) console.error(`  ${violation}`);
    process.exit(1);
  }
  console.log(`check-factory-imports: only the allowed files import from ${FACTORY_DIR}/`);
}

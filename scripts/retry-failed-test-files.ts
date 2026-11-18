import { appendFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SaxesParser } from 'saxes';
import { RUNNER_SUITE } from './package-test-reports';

/**
 * CI's backstop for a package test leg that failed: reruns each failing test file once, by
 * itself, through the package's `test` script, and passes only if every rerun passes.
 *
 * Usage: `bun scripts/retry-failed-test-files.ts <package dir> <JUnit report of the failed run>`
 *
 * The private CI runner is small, and some upstream tests are bound to wall-clock budgets that
 * it misses now and then. A rerun of the one file separates that from a real failure without
 * touching the test code. Each rerun prints `RETRIED <file>` to the log and, in Actions, the job
 * summary, so a retry is never silent. Failures are read from the JUnit report, never from test
 * output text. A failure the report ties to no file (a group's process crashing between tests)
 * cannot be rerun alone, so it fails the leg.
 */

export interface FailedFiles {
  /** Files with a failing or erroring test, or an erroring suite, in report order. */
  files: string[];
  /** Failures and errors the report counts that belong to no file. */
  unattributed: number;
}

/** An element the parser is inside: its tag, its `file`, and a suite's or case's `name`. */
interface Open {
  name: string;
  file: string | undefined;
  testcase: string | undefined;
}

export function failedTestFiles(xml: string): FailedFiles {
  const files = new Set<string>();
  // The selectors of each group whose process exited non-zero (the runner's own suite).
  const failedGroups: string[][] = [];
  let unattributed = 0;
  const open: Open[] = [];
  const parser = new SaxesParser();
  parser.on('opentag', tag => {
    const attr = (name: string): string | undefined => {
      const value = tag.attributes[name];
      return typeof value === 'string' ? value : undefined;
    };
    const file = attr('file')?.replaceAll('\\', '/');
    if (tag.name === 'testsuite' && file !== undefined && Number(attr('errors') ?? 0) > 0) {
      files.add(file);
    }
    if (tag.name === 'failure' || tag.name === 'error') {
      const innermost = (matches: (element: Open) => boolean): Open | undefined =>
        [...open].reverse().find(matches);
      const owner = innermost(element => element.file !== undefined)?.file;
      const inRunnerSuite = open.some(
        element => element.name === 'testsuite' && element.testcase === RUNNER_SUITE
      );
      const group = innermost(element => element.name === 'testcase')?.testcase;
      if (owner !== undefined) files.add(owner);
      else if (inRunnerSuite && group !== undefined) failedGroups.push(group.split(' '));
      else unattributed++;
    }
    open.push({
      name: tag.name,
      file,
      testcase: tag.name === 'testcase' || tag.name === 'testsuite' ? attr('name') : undefined,
    });
  });
  parser.on('closetag', () => {
    open.pop();
  });
  parser.write(xml).close();
  // A group's non-zero exit is explained when one of its files failed; rerunning that file
  // reruns the cause. A group exit with no failing file in it has no file to rerun.
  const selects = (selector: string, file: string): boolean =>
    file.includes(selector.replace(/^\.\//, ''));
  for (const group of failedGroups) {
    if (![...files].some(file => group.some(selector => selects(selector, file)))) unattributed++;
  }
  return { files: [...files], unattributed };
}

async function main(): Promise<number> {
  const [packageArg, reportArg] = Bun.argv.slice(2);
  if (packageArg === undefined || reportArg === undefined) {
    console.error('Usage: retry-failed-test-files.ts <package dir> <JUnit report>');
    return 2;
  }
  const packageDir = resolve(packageArg);
  if (!existsSync(reportArg)) {
    console.error(`::error::No JUnit report at ${reportArg}; nothing tells which file failed`);
    return 1;
  }
  const failed = failedTestFiles(readFileSync(reportArg, 'utf8'));
  if (failed.unattributed > 0 || failed.files.length === 0) {
    console.error(
      `::error::${String(failed.unattributed)} failure(s) in ${reportArg} name no test file, so they cannot be rerun alone`
    );
    return 1;
  }
  const summary = process.env.GITHUB_STEP_SUMMARY;
  const reports = mkdtempSync(join(tmpdir(), 'archon-test-retry-'));
  let code = 0;
  for (const [index, file] of failed.files.entries()) {
    const line = `RETRIED ${packageArg}/${file}`;
    console.log(line);
    const child = Bun.spawn(
      [
        process.execPath,
        'run',
        'test',
        file,
        '--reporter=junit',
        `--reporter-outfile=${join(reports, `${String(index)}.xml`)}`,
      ],
      { cwd: packageDir, stdio: ['inherit', 'inherit', 'inherit'] }
    );
    const exitCode = await child.exited;
    const verdict = exitCode === 0 ? 'passed on rerun' : 'failed again';
    console.log(`${line}: ${verdict}`);
    if (summary) appendFileSync(summary, `- \`${line}\`: ${verdict}\n`);
    if (exitCode !== 0) code = 1;
  }
  return code;
}

if (import.meta.main) process.exitCode = await main();

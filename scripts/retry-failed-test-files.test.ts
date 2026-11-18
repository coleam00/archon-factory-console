import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testTimeout, trackTempRoots } from '@archon/paths/test-utils';
import { runnerErrorReport } from './package-test-reports';
import { failedTestFiles } from './retry-failed-test-files';

const track = trackTempRoots();
const report = (...suites: string[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="bun test" tests="9">\n${suites.join('\n')}\n</testsuites>\n`;
const suite = (file: string, body: string, errors = 0): string =>
  `<testsuite name="${file}" file="${file}" errors="${String(errors)}">${body}</testsuite>`;
const failing = (file: string): string =>
  `<testcase name="x" file="${file}"><failure message="no" /></testcase>`;
const passing = (file: string): string => `<testcase name="y" file="${file}" />`;

test('a failing test names its file once, with forward slashes, and a passing file is left out', () => {
  const xml = report(
    suite(
      'src\\a.test.ts',
      `<testsuite name="describe">${failing('src\\a.test.ts')}${failing('src\\a.test.ts')}</testsuite>`
    ),
    suite('src/b.test.ts', passing('src/b.test.ts'))
  );
  expect(failedTestFiles(xml)).toEqual({ files: ['src/a.test.ts'], unattributed: 0 });
});

test('a suite that errored while loading names its file', () => {
  expect(failedTestFiles(report(suite('src/c.test.ts', '', 1)))).toEqual({
    files: ['src/c.test.ts'],
    unattributed: 0,
  });
});

const groupError = (selectors: string): string =>
  runnerErrorReport('Bun exited 1', selectors).suites;

test("a failed group's files that left no suite are rerun too, beside its failing file", () => {
  // Bun writes no suite for b.test.ts when it throws while loading; only the group error names it.
  expect(
    failedTestFiles(
      report(
        suite('src/a.test.ts', failing('src/a.test.ts')),
        groupError('./src/a.test.ts ./src/b.test.ts')
      )
    )
  ).toEqual({ files: ['src/a.test.ts', 'src/b.test.ts'], unattributed: 0 });
});

test('a failed group whose files all reported and passed leaves its failure unattributed', () => {
  expect(
    failedTestFiles(
      report(
        suite('src/a.test.ts', failing('src/a.test.ts')),
        suite('src/b.test.ts', passing('src/b.test.ts')),
        groupError('./src/b.test.ts')
      )
    )
  ).toEqual({ files: ['src/a.test.ts'], unattributed: 1 });
});

async function retry(root: string): Promise<{ code: number; stdout: string }> {
  const child = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, 'retry-failed-test-files.ts'),
      root,
      join(root, 'r.xml'),
    ],
    { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } }
  );
  const [code, stdout] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, stdout };
}

const passingFile = `test('passes', () => {});`;
const failingFile = `test('fails', () => expect(1).toBe(2));`;

/**
 * A package whose `test` script is the real runner, holding `files` (name to test body) under
 * src, and a report of the failed leg written by `reportXml`.
 */
function fixture(files: Record<string, string>, reportXml: string): string {
  const root = track(mkdtempSync(join(tmpdir(), 'retry-files-')));
  mkdirSync(join(root, 'src'));
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      scripts: {
        test: `bun run ${join(import.meta.dir, 'package-tests.ts').replaceAll('\\', '/')}`,
      },
    })
  );
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(
      join(root, 'src', `${name}.test.ts`),
      `import { test, expect } from 'bun:test';\n${body}`
    );
  }
  writeFileSync(join(root, 'r.xml'), reportXml);
  return root;
}
const flakyFailed = report(suite('src/flaky.test.ts', failing('src/flaky.test.ts')));

test(
  'a file that passes on its rerun passes the leg and says RETRIED, rerunning only that file',
  async () => {
    // other.test.ts always fails and the report does not name it: a rerun of more than the
    // named file would fail the leg.
    const root = fixture({ flaky: passingFile, other: failingFile }, flakyFailed);
    const result = await retry(root);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`RETRIED ${root}/src/flaky.test.ts`);
  },
  testTimeout(10000)
);

test(
  'a file that fails again fails the leg',
  async () => {
    const root = fixture({ flaky: failingFile }, flakyFailed);
    expect((await retry(root)).code).toBe(1);
  },
  testTimeout(10000)
);

test(
  'a file that never loaded beside a flaky file in its group is rerun and fails the leg',
  async () => {
    const root = fixture(
      { flaky: passingFile, broken: `throw new Error('cannot load');` },
      report(
        suite('src/flaky.test.ts', failing('src/flaky.test.ts')),
        groupError('./src/flaky.test.ts ./src/broken.test.ts')
      )
    );
    const result = await retry(root);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain(`RETRIED ${root}/src/broken.test.ts`);
  },
  testTimeout(10000)
);

test(
  'an unattributed failure fails the leg without a rerun, even when another file would pass',
  async () => {
    const root = fixture(
      { flaky: passingFile, other: passingFile },
      report(
        suite('src/flaky.test.ts', failing('src/flaky.test.ts')),
        suite('src/other.test.ts', passing('src/other.test.ts')),
        groupError('./src/other.test.ts')
      )
    );
    const result = await retry(root);
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain('RETRIED');
  },
  testTimeout(10000)
);

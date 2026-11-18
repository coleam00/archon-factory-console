import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

test("the runner's group error is explained by a failing file in that group, and not otherwise", () => {
  const groupError = (selectors: string): string =>
    runnerErrorReport('Bun exited 1', selectors).suites;
  expect(
    failedTestFiles(
      report(
        suite('src/a.test.ts', failing('src/a.test.ts')),
        groupError('./src/a.test.ts ./src/b.test.ts')
      )
    )
  ).toEqual({ files: ['src/a.test.ts'], unattributed: 0 });
  expect(
    failedTestFiles(
      report(suite('src/a.test.ts', failing('src/a.test.ts')), groupError('./src/b.test.ts'))
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

function fixture(body: string): string {
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
  writeFileSync(
    join(root, 'src', 'flaky.test.ts'),
    `import { test, expect } from 'bun:test';\nimport { existsSync, writeFileSync } from 'node:fs';\n${body}`
  );
  writeFileSync(
    join(root, 'r.xml'),
    report(suite('src/flaky.test.ts', failing('src/flaky.test.ts')))
  );
  return root;
}

test(
  'a file that passes on its rerun passes the leg and says RETRIED',
  async () => {
    const root = fixture(`test('once', () => expect(existsSync('seen')).toBe(true));`);
    writeFileSync(join(root, 'seen'), '');
    const result = await retry(root);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`RETRIED ${root}/src/flaky.test.ts: passed on rerun`);
  },
  testTimeout(10000)
);

test(
  'a file that fails again fails the leg',
  async () => {
    const root = fixture(`test('always', () => expect(1).toBe(2));`);
    const result = await retry(root);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('failed again');
  },
  testTimeout(10000)
);

test('a report whose failure names no file fails without a rerun', async () => {
  const root = track(mkdtempSync(join(tmpdir(), 'retry-files-')));
  writeFileSync(
    join(root, 'r.xml'),
    report(runnerErrorReport('Bun exited 1', './src/a.test.ts').suites)
  );
  const result = await retry(root);
  expect(result.code).toBe(1);
  expect(result.stdout).not.toContain('RETRIED');
  expect(readFileSync(join(root, 'r.xml'), 'utf8')).toContain('runner');
});

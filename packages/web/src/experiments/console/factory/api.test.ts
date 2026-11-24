import { afterEach, expect, test } from 'bun:test';
import { HttpError } from '../lib/http';
import { getForgeSubjects, getRunRecords } from './api';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Answers every request with `response`, recording the URLs asked for. */
function serve(response: () => Response): string[] {
  const asked: string[] = [];
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL): Promise<Response> => {
      asked.push(String(input));
      return response();
    },
    { preconnect: originalFetch.preconnect }
  );
  return asked;
}

test('the records read repeats runId= once per run, and fails with the server refusal', async () => {
  const records = { records: [], missing: [], unreadable: [] };
  const asked = serve(() => Response.json(records));
  const fields = { output: ['outcome'], result: ['change'] };
  expect(await getRunRecords(['r 1', 'r2'], fields)).toEqual(records);
  expect(asked).toEqual([
    '/api/workflows/runs/records?runId=r+1&runId=r2&outputKey=outcome&resultKey=change',
  ]);

  serve(() => Response.json({ error: 'Invalid query', detail: 'too many' }, { status: 400 }));
  const failed: unknown = await getRunRecords(['r1'], fields).catch((e: unknown) => e);
  expect(failed).toBeInstanceOf(HttpError);
  expect((failed as HttpError).serverError).toBe('Invalid query');
});

test('the forge read pairs each change run with its URL, by position', async () => {
  const asked = serve(() => Response.json({ issues: [], changes: [] }));
  await getForgeSubjects({
    codebaseId: 'cb',
    issues: [111],
    changes: [{ run: 'r1', url: 'https://x/pull/1' }],
    branchRuns: ['r2'],
  });
  expect(asked).toEqual([
    '/api/forge/subjects?codebaseId=cb&issue=111&changeRun=r1&changeUrl=https%3A%2F%2Fx%2Fpull%2F1&branchRun=r2',
  ]);
});

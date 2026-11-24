import { afterEach, expect, test } from 'bun:test';
import { HttpError } from '../lib/http';
import { getFactoryProgress } from './api';

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

test('the progress read repeats keys= once per item, and fails with the server refusal', async () => {
  const progress = { pack: 'p', progress: {}, members: {} };
  const asked = serve(() => Response.json(progress));
  expect(await getFactoryProgress({ codebaseId: 'cb 1', keys: ['#1', '2'] })).toEqual(progress);
  expect(asked).toEqual(['/api/factory/progress?codebaseId=cb+1&keys=%231&keys=2']);

  serve(() => Response.json({ error: 'No such project', detail: 'cb-9' }, { status: 404 }));
  const failed = await getFactoryProgress({ codebaseId: 'cb-9', keys: ['1'] }).catch(e => e);
  expect(failed).toBeInstanceOf(HttpError);
  expect((failed as HttpError).serverError).toBe('No such project');
});

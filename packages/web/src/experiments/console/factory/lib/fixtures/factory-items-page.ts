import type { FactoryItem } from '../../../skills/factory';

/**
 * Items as the console reads them (each read joined with its progress), captured from
 * `dev:console --fresh` on 2026-11-17: three deliver runs on `build__build` and one idle
 * item, each trimmed to its latest run. #4's `progress.runs`, `change.number` and the
 * `undecided` verdict were added by hand to the same runs.
 */
export const capturedItemsPage: { items: FactoryItem[] } = {
  items: [
    {
      item: {
        id: 'b67699236409b5c74dff09dd0cf85507',
        projectKey: 'coleam00/archon-factory-console',
        key: '12',
      },
      runs: [
        {
          id: 'c9773ff3-36bf-413e-a3b3-45ce93a77087',
          workflow: 'Wirasm/archon-software-factory:deliver',
          pack: null,
          status: 'running',
          outcome: null,
          startedAt: '2026-11-17T06:41:56.000Z',
          completedAt: null,
          cause: {
            kind: 'run_ended',
            runId: '5da88866-18d3-4045-9019-2a11d45899aa',
          },
          awaitingExecution: null,
          spend: { usd: null, inputTokens: null, outputTokens: null },
          heldBehind: null,
          operatorPause: null,
          hasResult: false,
          resultCommit: null,
        },
      ],
      queued: [],
      skipped: [],
      hold: null,
      runLimit: null,
      held: [],
      waits: [],
      merged: null,
      landing: null,
      questions: [],
      answers: [],
      links: [],
      degraded: [],
      progress: {
        title: 'Stage and step pages show which items are on a step now',
        running: {
          runId: 'c9773ff3-36bf-413e-a3b3-45ce93a77087',
          workflow: 'deliver',
          step: 'build__build',
          startedAt: '2026-11-17T06:41:56.000Z',
        },
        round: null,
        partOf: null,
        returned: 0,
        change: null,
        runs: [
          { runId: 'c9773ff3-36bf-413e-a3b3-45ce93a77087', workflow: 'deliver', failedStep: null },
        ],
        shadows: [],
        parked: null,
        awaits: null,
      },
    },
    {
      item: {
        id: 'd4e69506709729c0a0bd483f7b1cc1ba',
        projectKey: 'coleam00/archon-factory-console',
        key: '4',
      },
      runs: [
        {
          id: '624c763f-4f33-46ea-aa65-bb1ba78c1eec',
          workflow: 'Wirasm/archon-software-factory:deliver',
          pack: null,
          status: 'running',
          outcome: null,
          startedAt: '2026-11-17T06:44:47.000Z',
          completedAt: null,
          cause: {
            kind: 'receipt',
            receiptId: '0a1a1da2-4000-4731-a999-2af68e3875f5',
            sourceInstanceId: 'fc-start-deliver',
          },
          awaitingExecution: null,
          spend: { usd: null, inputTokens: null, outputTokens: null },
          heldBehind: null,
          operatorPause: null,
          hasResult: false,
          resultCommit: null,
        },
      ],
      queued: [],
      skipped: [],
      hold: null,
      runLimit: null,
      held: [],
      waits: [],
      merged: null,
      landing: null,
      questions: [],
      answers: [],
      links: [],
      degraded: [],
      progress: {
        title:
          'The board: every item in the column of its stage, with round, live step, returns and landed time',
        running: {
          runId: '624c763f-4f33-46ea-aa65-bb1ba78c1eec',
          workflow: 'deliver',
          step: 'build__build',
          startedAt: '2026-11-17T06:44:47.000Z',
        },
        round: {
          runId: 'fdef09db-c751-43a0-9eb5-c6386b8f8b60',
          iteration: 2,
          max: 3,
          rounds: [
            {
              iteration: 1,
              verdict: 'returned',
              outcome: 'return',
            },
            {
              iteration: 2,
              verdict: 'undecided',
              outcome: 'ask',
            },
          ],
        },
        partOf: null,
        returned: 1,
        change: {
          url: 'https://github.com/coleam00/archon-factory-console/pull/16',
          merged: 'unknown',
          mergedAt: null,
          number: null,
        },
        runs: [
          { runId: '624c763f-4f33-46ea-aa65-bb1ba78c1eec', workflow: 'deliver', failedStep: null },
        ],
        shadows: [],
        parked: null,
        awaits: null,
      },
    },
    {
      item: {
        id: '48b61271ea44036999b4eaf375ac3a92',
        projectKey: 'coleam00/archon-factory-console',
        key: '6',
      },
      runs: [
        {
          id: '585ed621-5f63-4148-bb95-92cfb4c7f52a',
          workflow: 'Wirasm/archon-software-factory:deliver',
          pack: null,
          status: 'running',
          outcome: null,
          startedAt: '2026-11-17T05:51:11.000Z',
          completedAt: null,
          cause: {
            kind: 'run_ended',
            runId: '2e291009-82e8-4582-8b36-8dd45ec8ee7e',
          },
          awaitingExecution: null,
          spend: { usd: null, inputTokens: null, outputTokens: null },
          heldBehind: null,
          operatorPause: null,
          hasResult: false,
          resultCommit: null,
        },
      ],
      queued: [],
      skipped: [],
      hold: null,
      runLimit: null,
      held: [],
      waits: [],
      merged: null,
      landing: null,
      questions: [],
      answers: [],
      links: [],
      degraded: [],
      progress: {
        title: "The item page: an item's timeline of runs and rounds, its asks, links and change",
        running: {
          runId: '585ed621-5f63-4148-bb95-92cfb4c7f52a',
          workflow: 'deliver',
          step: 'build__build',
          startedAt: '2026-11-17T05:51:11.000Z',
        },
        round: null,
        partOf: null,
        returned: 0,
        change: null,
        runs: [
          { runId: '585ed621-5f63-4148-bb95-92cfb4c7f52a', workflow: 'deliver', failedStep: null },
        ],
        shadows: [],
        parked: null,
        awaits: null,
      },
    },
    {
      item: {
        id: 'e039780b90df765f1bfed7359a4e6824',
        projectKey: 'coleam00/archon-factory-console',
        key: '5',
      },
      runs: [
        {
          id: 'f4e603d9-bdeb-4614-a411-77e76eb77777',
          workflow: 'Wirasm/archon-software-factory:deliver',
          pack: null,
          status: 'completed',
          outcome: 'ask',
          startedAt: '2026-11-17T05:25:23.000Z',
          completedAt: '2026-11-17T06:44:47.000Z',
          cause: {
            kind: 'run_ended',
            runId: '8ec270ee-657c-4513-99ba-45935a7d08dc',
          },
          awaitingExecution: null,
          spend: { usd: null, inputTokens: null, outputTokens: null },
          heldBehind: null,
          operatorPause: null,
          hasResult: false,
          resultCommit: null,
        },
      ],
      queued: [],
      skipped: [],
      hold: null,
      runLimit: null,
      held: [],
      waits: [],
      merged: null,
      landing: null,
      questions: [],
      answers: [],
      links: [],
      degraded: [],
      progress: {
        title: 'The factory map on the Overview: stages and hand-offs, live, with details on click',
        running: null,
        round: {
          runId: 'f4e603d9-bdeb-4614-a411-77e76eb77777',
          iteration: 2,
          max: 3,
          rounds: [
            {
              iteration: 1,
              verdict: 'returned',
              outcome: 'return',
            },
            {
              iteration: 2,
              verdict: 'undecided',
              outcome: 'ask',
            },
          ],
        },
        partOf: null,
        returned: 1,
        change: {
          url: 'https://github.com/coleam00/archon-factory-console/pull/17',
          merged: 'unknown',
          mergedAt: null,
          number: null,
        },
        runs: [
          { runId: 'f4e603d9-bdeb-4614-a411-77e76eb77777', workflow: 'deliver', failedStep: null },
        ],
        shadows: [],
        parked: null,
        awaits: null,
      },
    },
  ],
};

type Progress = NonNullable<FactoryItem['progress']>;

/**
 * A captured item renamed `key` with its progress replaced, for the states the capture does
 * not hold: a run between a loop's bodies, a run between steps, another workflow, no progress.
 */
export function capturedItemAs(
  key: string,
  progress: { running: Progress['running'] } | null,
  base: FactoryItem = capturedItemsPage.items[0] as FactoryItem
): FactoryItem {
  return {
    ...base,
    item: { ...base.item, id: `${base.item.id}-${key}`, key },
    progress: progress === null ? null : { ...(base.progress as Progress), ...progress },
  };
}

/**
 * What a stubbed server answers to the items read for `items`: a window page of their reads
 * at `/api/items/window`, and their progress at `/api/factory/progress`.
 */
export function itemsReadAnswer(items: readonly FactoryItem[]): (url: string) => Response {
  return url =>
    url.includes('/api/factory/progress')
      ? Response.json({
          pack: 'Wirasm/archon-software-factory',
          progress: Object.fromEntries(items.map(item => [item.item.key, item.progress])),
        })
      : Response.json({
          window: { since: '1970-01-01T00:00:00.000Z', until: '2026-11-17T12:00:00.000Z' },
          items: items.map(({ progress: _progress, ...read }) => read),
          next: null,
        });
}

/** Whether a stubbed server's `url` is one of the items read's two requests. */
export const isItemsRead = (url: string): boolean =>
  url.includes('/api/items/window') || url.includes('/api/factory/progress');

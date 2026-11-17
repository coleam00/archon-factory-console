import type { FactoryItemsPage } from '../../../skills/factory';

/**
 * `GET /api/factory/items` from `dev:console --fresh` on 2026-11-17: three deliver runs on
 * `build__build` and one idle item, each trimmed to its latest run.
 */
export const capturedItemsPage: FactoryItemsPage = {
  pack: 'Wirasm/archon-software-factory',
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
          status: 'running',
          outcome: null,
          startedAt: '2026-11-17T06:41:56.000Z',
          completedAt: null,
          cause: {
            kind: 'run_ended',
            runId: '5da88866-18d3-4045-9019-2a11d45899aa',
          },
          awaitingExecution: null,
        },
      ],
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
        ended: null,
        round: null,
        returned: 0,
        change: null,
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
        },
      ],
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
        ended: null,
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
              verdict: 'ended',
              outcome: 'ask',
            },
          ],
        },
        returned: 1,
        change: {
          url: 'https://github.com/coleam00/archon-factory-console/pull/16',
          merged: 'unknown',
          mergedAt: null,
        },
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
          status: 'running',
          outcome: null,
          startedAt: '2026-11-17T05:51:11.000Z',
          completedAt: null,
          cause: {
            kind: 'run_ended',
            runId: '2e291009-82e8-4582-8b36-8dd45ec8ee7e',
          },
          awaitingExecution: null,
        },
      ],
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
        ended: null,
        round: null,
        returned: 0,
        change: null,
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
          status: 'completed',
          outcome: 'ask',
          startedAt: '2026-11-17T05:25:23.000Z',
          completedAt: '2026-11-17T06:44:47.000Z',
          cause: {
            kind: 'run_ended',
            runId: '8ec270ee-657c-4513-99ba-45935a7d08dc',
          },
          awaitingExecution: null,
        },
      ],
      questions: [],
      answers: [],
      links: [],
      degraded: [],
      progress: {
        title: 'The factory map on the Overview: stages and hand-offs, live, with details on click',
        running: null,
        ended: {
          runId: 'f4e603d9-bdeb-4614-a411-77e76eb77777',
          workflow: 'deliver',
          status: 'completed',
          outcome: 'ask',
          completedAt: '2026-11-17T06:44:47.000Z',
        },
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
              verdict: 'ended',
              outcome: 'ask',
            },
          ],
        },
        returned: 1,
        change: {
          url: 'https://github.com/coleam00/archon-factory-console/pull/17',
          merged: 'unknown',
          mergedAt: null,
        },
      },
    },
  ],
  next: null,
};

type CapturedItem = FactoryItemsPage['items'][number];
type Progress = NonNullable<CapturedItem['progress']>;

/**
 * A captured item renamed `key` with its progress replaced, for the states the capture does
 * not hold: a run between a loop's bodies, a run between steps, another workflow, no progress.
 */
export function capturedItemAs(
  key: string,
  progress: { running: Progress['running'] } | null,
  base: CapturedItem = capturedItemsPage.items[0] as CapturedItem
): CapturedItem {
  return {
    ...base,
    item: { ...base.item, id: `${base.item.id}-${key}`, key },
    progress: progress === null ? null : { ...(base.progress as Progress), ...progress },
  };
}

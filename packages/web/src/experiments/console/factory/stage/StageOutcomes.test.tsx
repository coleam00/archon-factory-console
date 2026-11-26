import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PackGraph } from '../../skills/items';
import { StageOutcomes } from './StageOutcomes';

/** `check` ends approved (worded in its display:), returned (no words) or escalated (no arrow). */
const graph = {
  stages: [
    {
      workflow: 'check',
      outcome: {
        values: [
          {
            value: 'approve',
            display: { story: { withChange: 'Approved its change', withoutChange: 'Approved' } },
          },
          { value: 'return' },
          { value: 'escalate', display: { label: 'Escalated', story: 'Escalated it to you' } },
        ],
      },
    },
  ],
} as unknown as PackGraph;

test('each outcome reads as its label and its display: story, an arrowless one too', () => {
  const html = renderToStaticMarkup(
    <StageOutcomes
      view={{ outcomeLabels: { 'check:escalate': 'Escalated' } }}
      graph={graph}
      workflows={['check']}
    />
  );
  const items = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map(match =>
    (match[1] ?? '').replace(/<[^>]+>/g, '')
  );
  expect(items).toEqual([
    'approve: Approved its change',
    'return',
    'Escalated: Escalated it to you',
  ]);
});

test('nothing while the graph is read', () => {
  expect(
    renderToStaticMarkup(
      <StageOutcomes view={{ outcomeLabels: {} }} graph={undefined} workflows={['check']} />
    )
  ).toBe('');
});

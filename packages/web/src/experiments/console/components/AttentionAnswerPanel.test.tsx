import { expect, test } from 'bun:test';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { AttentionAnswerForm, AttentionAnswerPanel } from './AttentionAnswerPanel';
import { RunActionBar } from './RunActionBar';
import { toRun, type Run } from '../primitives/run';

function buttonClick(node: ReactNode, label: string): (() => void) | undefined {
  let click: (() => void) | undefined;
  Children.forEach(node, child => {
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(child)) return;
    if (child.type === 'button' && child.props.children === label) click = child.props.onClick;
    else click ??= buttonClick(child.props.children, label);
  });
  return click;
}

const attention = {
  kind: 'attention',
  runId: 'ask-run',
  nodeId: 'ask',
  message: 'Which base?',
  occurrence: 'pause-1',
  form: 'select',
  options: [{ id: 'use-main', label: 'Use main' }, { id: 'use-dev' }],
} as const satisfies NonNullable<Run['attention']>;
const run = toRun({
  id: 'ask-run',
  workflow_name: 'pick-base',
  codebase_id: null,
  status: 'paused',
  started_at: '2026-10-14T00:00:00.000Z',
  attention,
});

test('a select wait is answered with the chosen option at its occurrence, never resumed', async () => {
  let click: (() => void) | undefined;
  let resume: (() => void) | undefined;
  function Probe(): ReactElement | null {
    // The panel is the run's wrapper around the form; render the form it returns.
    const panel = AttentionAnswerPanel({ run, attention });
    if (!isValidElement<Parameters<typeof AttentionAnswerForm>[0]>(panel)) return null;
    const form = AttentionAnswerForm(panel.props);
    click = buttonClick(form, 'Use main');
    resume = buttonClick(RunActionBar({ run }), 'Resume');
    return form;
  }
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <Probe />
    </MemoryRouter>
  );
  expect(html).toContain('use-dev');
  expect(resume).toBeUndefined();
  const originalFetch = globalThis.fetch;
  const requests: { path: string; body: unknown }[] = [];
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        path:
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({ success: true });
    },
    { preconnect: originalFetch.preconnect }
  );
  try {
    click?.();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(requests).toEqual([
      {
        path: '/api/workflows/runs/ask-run/answer',
        body: { occurrence: 'pause-1', choose: ['use-main'] },
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the reserved 'other' option cannot be chosen without text", () => {
  const html = renderToStaticMarkup(
    <AttentionAnswerPanel
      run={run}
      attention={{
        ...attention,
        other: true,
        options: [...attention.options, { id: 'other', label: 'Other' }],
      }}
    />
  );
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Other<\/button>/);
  expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Use main<\/button>/);
});

test('the recommendation and what each option does are shown before the choices', () => {
  const recommended = {
    ...attention,
    options: [
      { id: 'use-main', label: 'Use main', does: 'Rebases the branch onto main.' },
      { id: 'use-dev' },
    ],
    recommendation: { option: 'use-main', why: 'Main has the fix.', confidence: 'medium' },
  } as const satisfies NonNullable<Run['attention']>;
  const html = renderToStaticMarkup(
    <AttentionAnswerPanel run={{ ...run, attention: recommended }} attention={recommended} />
  );
  expect(html).toContain('Recommended: Use main');
  expect(html).toContain('(medium confidence)');
  expect(html).toContain('Main has the fix.');
  expect(html).toContain('Rebases the branch onto main.');
  expect(html).toContain('Use main (recommended)');
});

test('the recommended option comes first, then the others with what each does and costs', () => {
  const html = renderToStaticMarkup(
    <AttentionAnswerForm
      wait={{
        form: 'select',
        options: [
          {
            id: 'use-main',
            label: 'Use main',
            does: 'Rebases onto main.',
            cost: 'Drops dev fixes.',
          },
          { id: 'use-dev', label: 'Use dev', does: 'Rebases onto dev.', cost: 'One more rebase.' },
        ],
        recommendation: { option: 'use-dev', why: 'Dev is the working base.' },
      }}
      submit={async () => {}}
    />
  );
  const at = (text: string): number => {
    const index = html.indexOf(text);
    expect(index).toBeGreaterThanOrEqual(0);
    return index;
  };
  expect(at('Recommended: Use dev')).toBeLessThan(at('Dev is the working base.'));
  expect(at('Dev is the working base.')).toBeLessThan(at('Rebases onto dev.'));
  expect(at('Cost: One more rebase.')).toBeLessThan(at('Use main'));
  expect(at('Use main')).toBeLessThan(at('Rebases onto main.'));
  expect(at('Rebases onto main.')).toBeLessThan(at('Cost: Drops dev fixes.'));
  // The answer buttons follow the same order.
  expect(at('Use dev (recommended)</button>')).toBeLessThan(at('>Use main</button>'));
});

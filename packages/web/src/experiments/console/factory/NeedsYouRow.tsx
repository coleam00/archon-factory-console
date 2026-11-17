import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import {
  AttentionAnswerForm,
  isLegacyAttention,
  type SubmitAnswer,
} from '../components/AttentionAnswerPanel';
import { ApprovalPanel } from '../components/ApprovalPanel';
import { relativeTime } from '../lib/format';
import * as skill from '../skills';
import type { AttentionQueue } from '../skills/runs';
import { invalidate } from '../store/cache';
import type { NeedsYouItem } from './lib/needs-you';
import { factoryPath } from './lib/views';

/**
 * Answer a queue item by its ref, then refresh every `runs` key (the project's queue, which
 * the answered item leaves, and the runs feed the answer moved on) and every `factory-items`
 * key (an item page lists the answer among its answers). A refusal refreshes too: it usually
 * means the item closed, so the stale row should go.
 */
export function answerByRef(ref: string): SubmitAnswer {
  return async (choose, text) => {
    try {
      await skill.answerAttentionItem(ref, { choose, ...(text === undefined ? {} : { text }) });
    } finally {
      invalidate('runs');
      invalidate('factory-items');
    }
  };
}

/** One open ask or paused wait, answerable in place; the item page lists its own with this. */
export function NeedsYouRow({
  projectId,
  item,
  queue,
}: {
  projectId: string;
  item: NeedsYouItem;
  queue: AttentionQueue;
}): ReactElement {
  return (
    <li className="flex flex-col gap-1.5 rounded-console-12 border border-warning/40 bg-surface px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 text-console-12 text-text-tertiary">
        <RowSubject projectId={projectId} item={item} />
        {item.pausedAt === null ? null : <span>{relativeTime(item.pausedAt)}</span>}
      </div>
      <RowContent projectId={projectId} item={item} queue={queue} />
    </li>
  );
}

const runPath = (projectId: string, runId: string): string => `/console/p/${projectId}/r/${runId}`;

/** The item the row is about, linking to its page; else the run holding the wait. */
export function RowSubject({
  projectId,
  item,
}: {
  projectId: string;
  item: NeedsYouItem;
}): ReactNode {
  const link = 'font-mono text-console-12 text-accent-bright hover:underline';
  if (item.item !== undefined)
    return (
      <Link
        to={factoryPath(projectId, `/items/${encodeURIComponent(item.item.key)}`)}
        className={link}
      >
        {item.item.key}
      </Link>
    );
  if (item.run === undefined) return null;
  return (
    <Link to={runPath(projectId, item.run.id)} className={link}>
      {item.run.workflow}
    </Link>
  );
}

/** What the row asks, answerable in place: the recommended option first, then the others. */
export function RowContent({
  projectId,
  item,
  queue,
}: {
  projectId: string;
  item: NeedsYouItem;
  queue: AttentionQueue;
}): ReactNode {
  switch (item.kind) {
    case 'attention':
      return (
        <>
          <p className="text-sm text-text-primary">{item.message}</p>
          {item.context === undefined ? null : (
            <p className="whitespace-pre-wrap text-console-12 text-text-secondary">
              {item.context}
            </p>
          )}
          {item.run !== undefined && isLegacyAttention(item.run) ? (
            <RunLink projectId={projectId} runId={item.run.id}>
              Paused before answers existed; resume it from the run
            </RunLink>
          ) : (
            <AttentionAnswerForm wait={item} submit={answerByRef(item.ref)} />
          )}
        </>
      );
    case 'awaiting_response': {
      const run = queue.runs.find(candidate => candidate.id === item.run.id);
      // ApprovalPanel prints the gate's message itself; the row adds it only for the link.
      if (run !== undefined) return <ApprovalPanel run={run} />;
      return (
        <>
          <p className="text-sm text-text-primary">{item.message}</p>
          <RunLink projectId={projectId} runId={item.run.id}>
            Answer it on the run
          </RunLink>
        </>
      );
    }
    case 'unreadable':
      return (
        <>
          <p className="text-sm text-text-primary">This paused run could not be read.</p>
          <p className="text-console-12 text-text-secondary">{item.detail}</p>
          <RunLink projectId={projectId} runId={item.run.id}>
            Resume or abandon it on the run
          </RunLink>
        </>
      );
  }
}

function RunLink({
  projectId,
  runId,
  children,
}: {
  projectId: string;
  runId: string;
  children: ReactNode;
}): ReactElement {
  return (
    <Link to={runPath(projectId, runId)} className="text-console-12 text-accent-bright underline">
      {children}
    </Link>
  );
}

import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import {
  AttentionAnswerForm,
  isLegacyAttention,
  type SubmitAnswer,
} from '../components/AttentionAnswerPanel';
import { ApprovalPanel } from '../components/ApprovalPanel';
import { relativeTime } from '../lib/format';
import { errorDetail } from '../lib/http';
import * as skill from '../skills';
import type { AttentionQueue } from '../skills/runs';
import { invalidate, type EntityView } from '../store/cache';
import { needsYou, type NeedsYouItem } from './lib/needs-you';
import { factoryPath } from './lib/views';

/**
 * Answer a queue item by its ref, then refresh every `runs` key: the project's queue (the
 * answered item leaves it on that read) and the runs feed the answer moved on. A refusal
 * refreshes too: it usually means the item closed, so the stale row should go.
 */
export function answerByRef(ref: string): SubmitAnswer {
  return async (choose, text) => {
    try {
      await skill.answerAttentionItem(ref, { choose, ...(text === undefined ? {} : { text }) });
    } finally {
      invalidate('runs');
    }
  };
}

/** The Overview's Needs-you section: every open ask and paused wait, newest first, answerable here. */
export function NeedsYouList({
  projectId,
  attention,
}: {
  projectId: string;
  attention: EntityView<AttentionQueue>;
}): ReactElement {
  const items = attention.data === undefined ? [] : needsYou(attention.data.items);
  return (
    <section id="needs-you" className="flex flex-col gap-2.5">
      <h3 className="text-console-11 font-medium uppercase tracking-wider text-text-tertiary">
        Needs you{attention.data === undefined ? '' : ` · ${items.length.toString()}`}
      </h3>
      <NeedsYouBody projectId={projectId} attention={attention} items={items} />
    </section>
  );
}

function NeedsYouBody({
  projectId,
  attention,
  items,
}: {
  projectId: string;
  attention: EntityView<AttentionQueue>;
  items: NeedsYouItem[];
}): ReactNode {
  const { data, error } = attention;
  if (data === undefined) {
    if (error !== undefined)
      return (
        <p role="alert" className="text-sm text-error">
          What needs you could not be loaded: {errorDetail(error)}
        </p>
      );
    return <p className="text-xs text-text-tertiary">Loading…</p>;
  }
  return (
    <>
      {data.degraded.length > 0 ? (
        <p role="alert" className="text-console-12 text-warning">
          {data.degraded.length === 1
            ? 'One paused run could not be read, so what it waits on is not listed.'
            : `${data.degraded.length.toString()} paused runs could not be read, so what they wait on is not listed.`}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="text-sm text-text-secondary">Nothing is waiting on a person.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map(item => (
            <NeedsYouRow key={item.ref} projectId={projectId} item={item} queue={data} />
          ))}
        </ul>
      )}
    </>
  );
}

function NeedsYouRow({
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
function RowSubject({ projectId, item }: { projectId: string; item: NeedsYouItem }): ReactNode {
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

function RowContent({
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

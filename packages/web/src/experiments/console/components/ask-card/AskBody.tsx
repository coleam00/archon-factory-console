import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { ownerLostMessage } from '../../lib/needs-you';
import { answerByRef, AttentionAnswerForm, isLegacyAttention } from '../AttentionAnswerPanel';
import type { AskCardProps } from './AskCard';
import { GateAnswer } from './GateAnswer';

const runPath = (projectId: string, runId: string): string => `/console/p/${projectId}/r/${runId}`;

/**
 * Under the question: the tiles and confirm row for what the console can answer here, else
 * what happened and a link to the run, where it is resumed, abandoned or answered.
 */
export function AskBody({ projectId, ask, queue, onAnswered }: AskCardProps): ReactNode {
  const answered = (label: string): void => onAnswered?.(ask, label);
  switch (ask.kind) {
    case 'attention':
      if (ask.run !== undefined && isLegacyAttention(ask.run))
        return (
          <RunLink projectId={projectId} runId={ask.run.id}>
            Paused before answers existed; resume it from the run
          </RunLink>
        );
      return <AttentionAnswerForm wait={ask} submit={answerByRef(ask.ref)} onAnswered={answered} />;
    case 'awaiting_response': {
      const run = queue.runs.find(candidate => candidate.id === ask.run.id);
      const attention = run?.attention;
      if (attention?.kind === 'blocked_on_child' || attention?.kind === 'blocked_on_children')
        return (
          <RunLink projectId={projectId} runId={ask.run.id}>
            Waiting on sub-runs; review them from the run
          </RunLink>
        );
      if (run === undefined)
        return (
          <RunLink projectId={projectId} runId={ask.run.id}>
            Answer it on the run
          </RunLink>
        );
      return <GateAnswer run={run} onAnswered={answered} />;
    }
    case 'owner_lost':
      return <Unanswerable projectId={projectId} runId={ask.run.id} what={ownerLostMessage(ask)} />;
    case 'unreadable':
      return <Unanswerable projectId={projectId} runId={ask.run.id} what={ask.detail} />;
  }
}

/** A paused run the console cannot answer here: what happened, and the run instead of tiles. */
function Unanswerable({
  projectId,
  runId,
  what,
}: {
  projectId: string;
  runId: string;
  what: string;
}): ReactElement {
  return (
    <>
      <p className="text-console-14 text-text-secondary [overflow-wrap:anywhere]">{what}</p>
      <RunLink projectId={projectId} runId={runId}>
        Resume or abandon it on the run
      </RunLink>
    </>
  );
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
    <Link
      to={runPath(projectId, runId)}
      className="self-start text-console-13 text-text-secondary underline hover:text-text-primary"
    >
      {children}
    </Link>
  );
}

import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { ApprovalPanel } from '../components/ApprovalPanel';
import { AttentionAnswerPanel } from '../components/AttentionAnswerPanel';
import { ItemAsksSection } from '../components/ItemAsksSection';
import type { FactoryItem } from './api';
import { askQuestion, entryRunId } from './lib/attention';
import type { FactoryAsks, HeldEntry } from './useItemAsks';

/**
 * What waits on one item, drawn by Archon's own ask components: its asks in Archon's
 * `ItemAsksSection`, answered by ref; a paused run's wait in `AttentionAnswerPanel` and its
 * gate in `ApprovalPanel`, as Archon's pending-input banner draws them; anything else (a run
 * that cannot be read, one that lost its owner, a wait past its deadline) as a link to its run,
 * where it is resumed or abandoned. The board's ask view and the item page both draw this.
 */
export function ItemAsksBody({
  projectId,
  item,
  asks,
}: {
  projectId: string;
  item: Pick<FactoryItem, 'item' | 'questions'>;
  asks: FactoryAsks;
}): ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <ItemAsksSection {...asks.sectionOf(item)} showProject={false} />
      {asks.heldOf(item).map(held => (
        <HeldAsk key={held.entry.ref} projectId={projectId} held={held} />
      ))}
    </div>
  );
}

function HeldAsk({ projectId, held }: { projectId: string; held: HeldEntry }): ReactElement {
  const { entry, run } = held;
  const runId = entryRunId(entry);
  let answer: ReactNode = null;
  if (run?.attention?.kind === 'attention')
    answer = <AttentionAnswerPanel run={run} attention={run.attention} />;
  else if (run?.attention?.kind === 'awaiting_response') answer = <ApprovalPanel run={run} />;
  return (
    <article
      data-held-ask={entry.ref}
      className="rounded border border-warning/40 bg-surface py-3 pl-4 pr-3"
    >
      <p className="whitespace-pre-wrap text-sm text-text-primary">{askQuestion(entry)}</p>
      {answer ??
        (runId === undefined ? null : (
          <Link
            to={`/console/p/${projectId}/r/${runId}`}
            className="mt-2 inline-block text-console-12 text-text-secondary underline hover:text-text-primary"
          >
            Open the run to resume or abandon it
          </Link>
        ))}
    </article>
  );
}

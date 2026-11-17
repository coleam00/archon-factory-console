import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { recentlySettled, type SettledAsks } from './lib/answered';
import { factoryPath, type FactoryViewListed } from './lib/views';
import { useFactoryItems } from './useFactoryItems';

const STATUS_WORDS: Record<NonNullable<SettledAsks['restart']>['status'], string> = {
  pending: 'waiting to start',
  running: 'running',
  paused: 'paused',
  completed: 'done',
  failed: 'failed',
  cancelled: 'cancelled',
};

function counts(entry: SettledAsks): string {
  const parts = [`${entry.answered.toString()} answered`];
  if (entry.withdrawn > 0) parts.push(`${entry.withdrawn.toString()} withdrawn`);
  return parts.join(', ');
}

/** What the settling started: the stage, linking to its run, or that no run names it as its start. */
function Restart({
  projectId,
  restart,
}: {
  projectId: string;
  restart: SettledAsks['restart'];
}): ReactNode {
  if (restart === null)
    return <span className="text-text-tertiary">no run started from these answers</span>;
  return (
    <Link
      to={`/console/p/${projectId}/r/${restart.runId}`}
      className="text-text-primary hover:underline"
    >
      {restart.stageLabel ?? 'A run'} started again ({STATUS_WORDS[restart.status]})
    </Link>
  );
}

/**
 * Under the open asks: the asks items settled lately and the stage each settling started
 * again, read from the items, so an answer given anywhere shows. Nothing shows until an item
 * has settled its asks.
 */
export function AnsweredLately({
  projectId,
  view,
}: {
  projectId: string;
  view: FactoryViewListed['declaration'];
}): ReactNode {
  const items = useFactoryItems(projectId);
  const settled = items.data === undefined ? [] : recentlySettled(view, items.data);
  if (settled.length === 0) return null;
  return (
    <section aria-label="Answered lately" className="flex flex-col gap-1">
      <h4 className="text-console-11 font-medium uppercase tracking-wider text-text-tertiary">
        Answered lately
      </h4>
      <ul className="flex flex-col gap-0.5">
        {settled.map(entry => (
          <li key={`${entry.itemKey}:${entry.at}`} className="text-console-12 text-text-secondary">
            <Link
              to={factoryPath(projectId, `/items/${encodeURIComponent(entry.itemKey)}`)}
              className="font-mono text-console-11 text-text-primary hover:underline"
            >
              #{entry.itemKey}
            </Link>{' '}
            · {counts(entry)} · <Restart projectId={projectId} restart={entry.restart} />
          </li>
        ))}
      </ul>
    </section>
  );
}

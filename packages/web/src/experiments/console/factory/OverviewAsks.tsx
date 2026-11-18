import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { AskCard } from '../components/ask-card/AskCard';
import { askNaming, itemTitles } from '../lib/ask-naming';
import { errorDetail } from '../lib/http';
import { needsYou, needsYouPath } from '../lib/needs-you';
import type { AttentionQueue } from '../skills/runs';
import type { EntityView } from '../store/cache';
import { readFailed, SlowReadError } from './lib/deadline';
import type { FactoryViewListed } from './lib/views';
import { SLOW_READ_NOTICE } from './FactoryLoading';
import { useFactoryItems } from './useFactoryItems';

/** How many asks the Overview shows before "N more" leads to the Needs you tab. */
export const OVERVIEW_ASKS_SHOWN = 3;

/**
 * The Overview's Needs you: the newest asks as compact cards (the question and the
 * recommended tile), each opening on the Needs you tab, where it is answered; then how many
 * more wait there. Nothing shows when nothing waits.
 */
export function OverviewAsks({
  projectId,
  view,
  attention,
}: {
  projectId: string;
  view: FactoryViewListed;
  attention: EntityView<AttentionQueue>;
}): ReactNode {
  // The items the Overview's numbers and map read already: the cards name each item's title.
  const items = useFactoryItems(projectId);
  const queue = attention.data;
  if (queue === undefined) {
    const failed = readFailed(attention.error);
    if (failed !== undefined)
      return (
        <p role="alert" className="text-console-14 text-error">
          What needs you could not be loaded: {errorDetail(failed)}
        </p>
      );
    return <OverviewAsksLoading slow={attention.error instanceof SlowReadError} />;
  }
  const asks = needsYou(queue.items);
  if (asks.length === 0) return null;
  const naming = askNaming(projectId, view, itemTitles(items.data));
  const more = asks.length - OVERVIEW_ASKS_SHOWN;
  return (
    <section aria-label="Needs you" className="flex flex-col gap-3">
      <h3 className="text-console-12 font-medium uppercase tracking-console-label text-text-tertiary">
        Needs you
      </h3>
      {asks.slice(0, OVERVIEW_ASKS_SHOWN).map(ask => {
        const where = naming.where(ask);
        return (
          <AskCard
            key={ask.ref}
            projectId={projectId}
            ask={ask}
            queue={queue}
            subject={naming.subject(ask)}
            {...(where === undefined ? {} : { where })}
            variant="compact"
            openHref={needsYouPath(projectId, ask.ref)}
          />
        );
      })}
      {more > 0 ? <MoreLink projectId={projectId} more={more} /> : null}
    </section>
  );
}

/** Skeletons of the compact cards to come (Visual standard rule 6), and why when the read is slow. */
function OverviewAsksLoading({ slow }: { slow: boolean }): ReactElement {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">Loading what needs you</span>
      {slow ? <p className="text-console-13 text-text-tertiary">{SLOW_READ_NOTICE}</p> : null}
      {[0, 1, 2].map(index => (
        <div
          key={index}
          aria-hidden
          className="h-24 w-full max-w-3xl rounded-console-16 bg-surface-elevated motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
}

function MoreLink({ projectId, more }: { projectId: string; more: number }): ReactElement {
  return (
    <Link
      to={needsYouPath(projectId)}
      className="self-start text-console-13 text-accent-bright hover:underline"
    >
      {more.toString()} more on Needs you
    </Link>
  );
}

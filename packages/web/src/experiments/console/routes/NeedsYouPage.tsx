import { useEffect, useMemo, type ReactElement, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { AnsweredLately } from '../components/ask-card/AnsweredLately';
import { AskGroup } from '../components/ask-card/AskGroup';
import { useAnsweredHold } from '../components/ask-card/useAnsweredHold';
import { useProjectAttention } from '../components/ProjectAttention';
import { ProjectHeader } from '../components/ProjectHeader';
import { ProjectViewTabs } from '../components/ProjectViewTabs';
import { readFailed, SlowReadError } from '../factory/lib/deadline';
import { currentView, type FactoryViewListed } from '../factory/lib/views';
import { SLOW_READ_NOTICE } from '../factory/FactoryLoading';
import { useFactoryItems } from '../factory/useFactoryItems';
import { useFactoryViews } from '../factory/useFactoryViews';
import { groupBySubject } from '../lib/ask-card';
import { askNaming, itemTitles, type AskNaming } from '../lib/ask-naming';
import { errorDetail } from '../lib/http';
import { needsYou, needsYouCount, needsYouItemCount, type NeedsYouItem } from '../lib/needs-you';
import type { Project } from '../primitives/project';
import * as skill from '../skills';
import type { AttentionQueue } from '../skills/runs';
import { useEntity, type EntityView } from '../store/cache';
import { K } from '../store/keys';

/**
 * `/console/p/:projectId/needs-you`: every open ask and paused wait on the project's items
 * and runs, from any workflow, answerable in place, grouped under their item; then the asks
 * settled lately. A project tab on every project, factory or not (DESIGN.md, owner change 2).
 */
export function NeedsYouPage(): ReactElement {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { data: project } = useEntity<Project>(K.project(projectId), () =>
    skill.getProject(projectId)
  );
  return (
    <section className="flex h-full flex-col">
      <ProjectHeader title={project?.name ?? 'Project'} subtitle={project?.path ?? 'Loading…'}>
        <ProjectViewTabs projectId={projectId} active="needs-you" />
      </ProjectHeader>
      <div className="flex-1 overflow-y-auto p-6">
        <NeedsYouBody projectId={projectId} />
      </div>
    </section>
  );
}

function NeedsYouBody({ projectId }: { projectId: string }): ReactElement {
  const attention = useProjectAttention();
  const listing = useFactoryViews(projectId);
  // Which read names the asks waits on the views listing; a failed listing reads as no view.
  const known = listing.data !== undefined || readFailed(listing.error) !== undefined;
  const view = currentView(listing.data);
  const queue = attention.data;
  return (
    <div className="flex flex-col gap-6">
      <Heading queue={queue} />
      <QueueState attention={attention} />
      {queue === undefined || !known ? null : view === undefined ? (
        <Asks projectId={projectId} queue={queue} naming={askNaming(projectId, undefined)} />
      ) : (
        <FactoryAsks projectId={projectId} queue={queue} view={view} />
      )}
      {queue === undefined || !known ? null : (
        <AnsweredLately projectId={projectId} view={view} empty={needsYouCount(queue) === 0} />
      )}
    </div>
  );
}

/** "N things need you", with how many items they sit on; skeleton bars until the queue is read. */
function Heading({ queue }: { queue: AttentionQueue | undefined }): ReactElement {
  if (queue === undefined)
    return (
      <div aria-hidden className="flex flex-col gap-2 motion-safe:animate-pulse">
        <div className="h-5.5 w-3/5 rounded bg-surface-elevated" />
        <div className="h-3 w-2/5 rounded bg-surface-elevated" />
      </div>
    );
  const count = needsYouCount(queue);
  const items = needsYouItemCount(needsYou(queue.items));
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-console-22 font-semibold tracking-console-heading text-text-primary">
        {count === 1 ? '1 thing needs you' : `${count.toString()} things need you`}
      </h2>
      {count === 0 ? null : (
        <p className="text-console-13 text-text-tertiary">
          {items === 1 ? 'on 1 item' : `on ${items.toString()} items`}
        </p>
      )}
    </div>
  );
}

/** Why the queue is not (fully) shown: loading, a failed read, or paused runs it could not read. */
function QueueState({ attention }: { attention: EntityView<AttentionQueue> }): ReactNode {
  const { data, error } = attention;
  if (data === undefined) {
    const failed = readFailed(error);
    if (failed !== undefined)
      return (
        <p role="alert" className="text-console-14 text-error">
          What needs you could not be loaded: {errorDetail(failed)}
        </p>
      );
    return <CardSkeletons slow={error instanceof SlowReadError} />;
  }
  if (data.degraded.length === 0) return null;
  return (
    <p role="alert" className="text-console-13 text-warning">
      {data.degraded.length === 1
        ? 'One paused run could not be read, so what it waits on is not listed.'
        : `${data.degraded.length.toString()} paused runs could not be read, so what they wait on is not listed.`}
    </p>
  );
}

/** Skeletons of the cards to come (Visual standard rule 6). */
function CardSkeletons({ slow }: { slow: boolean }): ReactElement {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">{slow ? SLOW_READ_NOTICE : 'Loading what needs you'}</span>
      {slow ? <p className="text-console-13 text-text-tertiary">{SLOW_READ_NOTICE}</p> : null}
      {[0, 1].map(index => (
        <div
          key={index}
          aria-hidden
          className="h-44 w-full max-w-3xl rounded-console-16 bg-surface-elevated motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
}

/** With a factory view, the cards take the items' titles and their stages' names. */
function FactoryAsks({
  projectId,
  queue,
  view,
}: {
  projectId: string;
  queue: AttentionQueue;
  view: FactoryViewListed;
}): ReactElement {
  const items = useFactoryItems(projectId);
  const titles = useMemo(() => itemTitles(items.data), [items.data]);
  return <Asks projectId={projectId} queue={queue} naming={askNaming(projectId, view, titles)} />;
}

/** Every ask and wait, grouped under its item; an answered one stays, saying so, for 5 s. */
function Asks({
  projectId,
  queue,
  naming,
}: {
  projectId: string;
  queue: AttentionQueue;
  naming: AskNaming;
}): ReactNode {
  const live = useMemo(() => needsYou(queue.items), [queue.items]);
  const hold = useAnsweredHold(live);
  useBringForward(hold.asks);
  if (hold.asks.length === 0) return null;
  return (
    <div className="flex flex-col gap-6">
      {groupBySubject(hold.asks).map(group => (
        <AskGroup
          key={group.key}
          projectId={projectId}
          subject={naming.subject(group.first)}
          asks={group.asks}
          queue={queue}
          where={naming.where}
          hold={hold}
        />
      ))}
    </div>
  );
}

/** `?ask=<ref>` (the Overview's Open): scroll to that card and focus it, once it is drawn. */
function useBringForward(asks: readonly NeedsYouItem[]): void {
  const [params] = useSearchParams();
  const ref = params.get('ask');
  const present = ref !== null && asks.some(ask => ask.ref === ref);
  useEffect(() => {
    if (!present) return;
    const card = [...document.querySelectorAll<HTMLElement>('[data-ask]')].find(
      element => element.dataset.ask === ref
    );
    card?.scrollIntoView?.({ block: 'center' });
    card?.focus({ preventScroll: true });
  }, [present, ref]);
}

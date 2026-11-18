import { Inbox } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { readFailed } from '../../factory/lib/deadline';
import { readEveryItem } from '../../factory/lib/factory-items-read';
import { recentlySettled, type SettledAsks } from '../../factory/lib/answered';
import { factoryPath, type FactoryViewListed } from '../../factory/lib/views';
import { useFactoryItems } from '../../factory/useFactoryItems';
import { useFactoryRead } from '../../factory/useFactoryRead';
import { relativeTime } from '../../lib/format';
import { errorDetail } from '../../lib/http';
import { listItemWindow, type ItemRead } from '../../skills/items';
import { K } from '../../store/keys';
import { AnsweredCard } from './AnsweredCard';

interface AnsweredProps {
  projectId: string;
  /** Nothing needs a person: draw the empty state above the answered cards. */
  empty: boolean;
}

/**
 * Under the open asks (or as the empty state): the sets of asks items settled lately, as
 * folded cards. With a factory view it reads the items the Factory pages read (stage names,
 * titles); without one, the engine's items window alone, so a project with no factory has
 * them too.
 */
export function AnsweredLately({
  view,
  ...props
}: AnsweredProps & { view: FactoryViewListed | undefined }): ReactElement {
  return view === undefined ? (
    <AnsweredFromWindow {...props} />
  ) : (
    <AnsweredFromFactory {...props} view={view} />
  );
}

function AnsweredFromFactory({
  projectId,
  empty,
  view,
}: AnsweredProps & { view: FactoryViewListed }): ReactElement {
  const items = useFactoryItems(projectId);
  const settled =
    items.data === undefined ? undefined : recentlySettled(view.declaration, items.data);
  return (
    <AnsweredSection
      projectId={projectId}
      empty={empty}
      settled={settled}
      failed={readFailed(items.error)}
      href={entry => factoryPath(projectId, `/items/${encodeURIComponent(entry.itemKey)}`)}
    />
  );
}

function AnsweredFromWindow({ projectId, empty }: AnsweredProps): ReactElement {
  // Under the `factory-items:<id>` prefix, so an ask opening or closing reads it again.
  const items = useFactoryRead<ItemRead[]>(K.projectItems(projectId), within =>
    readEveryItem(projectId, listItemWindow, within)
  );
  const settled = items.data === undefined ? undefined : recentlySettled(null, items.data);
  return (
    <AnsweredSection
      projectId={projectId}
      empty={empty}
      settled={settled}
      failed={readFailed(items.error)}
      href={entry =>
        entry.restart === null ? undefined : `/console/p/${projectId}/r/${entry.restart.runId}`
      }
    />
  );
}

/** When something was last asked: the newest asking run's end among the settled sets. */
function lastAsked(settled: readonly SettledAsks[]): string | undefined {
  const times = settled.flatMap(entry => (entry.askedAt === null ? [] : [entry.askedAt]));
  return times.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}

/**
 * The answered sets, under the open asks or as the empty state. While the history is unread
 * the empty state shows skeletons where "Last asked" and the cards go, never the sentence for
 * a project nothing ever asked; a history read that failed says so in an alert.
 */
function AnsweredSection({
  projectId,
  empty,
  settled,
  failed,
  href,
}: AnsweredProps & {
  /** Undefined while the history is unread, or when its read failed. */
  settled: SettledAsks[] | undefined;
  failed: Error | undefined;
  href: (entry: SettledAsks) => string | undefined;
}): ReactNode {
  const alert =
    settled === undefined && failed !== undefined ? <HistoryFailed failed={failed} /> : null;
  const cards =
    settled === undefined || settled.length === 0 ? null : (
      <AnsweredHeading>
        <div className="flex flex-col gap-3">
          {settled.map(entry => (
            <AnsweredCard
              key={`${entry.itemKey}:${entry.at}`}
              projectId={projectId}
              entry={entry}
              href={href(entry)}
            />
          ))}
        </div>
      </AnsweredHeading>
    );
  if (!empty) return alert ?? cards;
  return (
    <section aria-label="Nothing needs you" className="flex flex-col gap-6">
      <NothingNeedsYou
        projectId={projectId}
        settled={settled}
        loading={settled === undefined && failed === undefined}
      />
      {alert}
      {settled === undefined && failed === undefined ? <AnsweredSkeletons /> : null}
      {cards}
    </section>
  );
}

/** A history read that failed: what could not be read, in the server's words. */
function HistoryFailed({ failed }: { failed: Error }): ReactElement {
  return (
    <p role="alert" className="text-console-13 text-error">
      What was answered lately could not be loaded: {errorDetail(failed)}
    </p>
  );
}

/**
 * Rule 6's empty state: the icon, the sentence, then when something was last asked, or what
 * appears here when nothing ever was; a skeleton bar while the history is unread.
 */
function NothingNeedsYou({
  projectId,
  settled,
  loading,
}: {
  projectId: string;
  settled: SettledAsks[] | undefined;
  loading: boolean;
}): ReactElement {
  const asked = settled === undefined ? undefined : lastAsked(settled);
  return (
    <div className="flex flex-col items-start gap-2">
      <Inbox aria-hidden className="size-5 text-text-tertiary" />
      <p className="text-console-14 text-text-secondary">Nothing needs you right now.</p>
      {settled === undefined ? null : (
        <p className="text-console-13 text-text-tertiary">
          {asked === undefined
            ? 'A question a run asks, or a run paused for your decision, appears here to answer.'
            : `Last asked ${relativeTime(asked)}`}
        </p>
      )}
      {loading ? (
        <div
          aria-hidden
          className="h-3 w-2/5 rounded bg-surface-elevated motion-safe:animate-pulse"
        />
      ) : null}
      <Link
        to={`/console/p/${projectId}`}
        className="text-console-13 text-accent-bright hover:underline"
      >
        See this project's runs
      </Link>
    </div>
  );
}

/** Skeletons of the three answered cards to come (Visual standard rule 6). */
function AnsweredSkeletons(): ReactElement {
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">Loading what was answered lately</span>
      {[0, 1, 2].map(index => (
        <div
          key={index}
          aria-hidden
          className="h-32 w-full max-w-3xl rounded-console-16 bg-surface-elevated motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
}

function AnsweredHeading({ children }: { children: ReactNode }): ReactElement {
  return (
    <section aria-label="Answered lately" className="flex flex-col gap-3">
      <h2 className="text-console-12 font-medium uppercase tracking-console-label text-text-tertiary">
        Answered lately
      </h2>
      {children}
    </section>
  );
}

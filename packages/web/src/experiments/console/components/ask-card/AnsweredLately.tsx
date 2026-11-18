import { Inbox } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { readEveryItem } from '../../factory/lib/factory-items-read';
import { recentlySettled, type SettledAsks } from '../../factory/lib/answered';
import { factoryPath, type FactoryViewListed } from '../../factory/lib/views';
import { useFactoryItems } from '../../factory/useFactoryItems';
import { useFactoryRead } from '../../factory/useFactoryRead';
import { relativeTime } from '../../lib/format';
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

function AnsweredSection({
  projectId,
  empty,
  settled,
  href,
}: AnsweredProps & {
  settled: SettledAsks[] | undefined;
  href: (entry: SettledAsks) => string | undefined;
}): ReactNode {
  const cards =
    settled === undefined || settled.length === 0 ? null : (
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
    );
  if (empty) {
    const asked = settled === undefined ? undefined : lastAsked(settled);
    return (
      <section aria-label="Nothing needs you" className="flex flex-col gap-6">
        <div className="flex flex-col items-start gap-2">
          <Inbox aria-hidden className="size-5 text-text-tertiary" />
          <p className="text-console-14 text-text-secondary">Nothing needs you right now.</p>
          <p className="text-console-13 text-text-tertiary">
            {asked === undefined
              ? 'A question a run asks, or a run paused for your decision, appears here to answer.'
              : `Last asked ${relativeTime(asked)}`}
          </p>
          <Link
            to={`/console/p/${projectId}`}
            className="text-console-13 text-accent-bright hover:underline"
          >
            See this project's runs
          </Link>
        </div>
        {cards === null ? null : <AnsweredHeading>{cards}</AnsweredHeading>}
      </section>
    );
  }
  return cards === null ? null : <AnsweredHeading>{cards}</AnsweredHeading>;
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

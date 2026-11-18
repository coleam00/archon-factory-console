import type { ReactElement, ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { EmptyState } from '../components/EmptyState';
import { ProjectHeader } from '../components/ProjectHeader';
import { ProjectViewTabs } from '../components/ProjectViewTabs';
import type { Project } from '../primitives/project';
import * as skill from '../skills';
import type { FactoryOverviewRead, FactoryViews } from '../skills/factory';
import type { AttentionQueue } from '../skills/runs';
import type { EntityView } from '../store/cache';
import { K } from '../store/keys';
import { ClampedSummary } from './ClampedSummary';
import { useFactoryRead } from './useFactoryRead';
import { useFactoryViews } from './useFactoryViews';
import { readFailed, SlowReadError } from './lib/deadline';
import { needsYou } from './lib/needs-you';
import { howItWorksShown } from './lib/overview-nav';
import { useSectionAttention } from './section-attention';
import { currentView, factoryPath, type FactoryViewListed } from './lib/views';
import { FactoryLoading, SLOW_READ_NOTICE } from './FactoryLoading';

/** The sub-navigation entry a page sits under; item, stage and step pages sit under none. */
export type FactorySection = 'overview' | 'board' | 'needs-you' | 'how-it-works' | null;

interface FactoryFrameProps {
  section: FactorySection;
  /** Let the page use the full width, as the board's columns need; others keep a reading width. */
  wide?: boolean;
  /**
   * The page body, drawn under the view's header once a view applies, with the project's
   * attention queue: the section's one read (`useSectionAttention`), so the count and a page's
   * list share one fetch and stream.
   */
  children: (view: FactoryViewListed, attention: EntityView<AttentionQueue>) => ReactNode;
}

/**
 * Every Factory page's frame: the project heading and tabs, then the factory view's title,
 * summary and sub-navigation, any declaration that failed, and the page. A project no view
 * applies to gets an empty state instead.
 */
export function FactoryFrame({ section, wide = false, children }: FactoryFrameProps): ReactElement {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const project = useFactoryRead<Project>(K.project(projectId), within =>
    within(signal => skill.getProject(projectId, { signal }))
  );
  const listing = useFactoryViews(projectId);
  const view = currentView(listing.data);
  return (
    <section className="flex h-full flex-col">
      <ProjectHeader
        title={project.data?.name ?? 'Project'}
        subtitle={
          project.data?.path ??
          (project.error instanceof SlowReadError ? SLOW_READ_NOTICE : 'Loading…')
        }
      >
        <ProjectViewTabs projectId={projectId} active="factory" />
      </ProjectHeader>
      <div className="flex-1 overflow-y-auto px-4 pb-7.5 pt-5.5 md:px-7.5">
        <div className={`flex flex-col gap-5 ${wide ? '' : 'max-w-5xl'}`}>
          {view === undefined ? (
            <>
              <FactoryErrors errors={listing.data?.errors ?? []} />
              <FactoryAbsent projectId={projectId} listing={listing} />
            </>
          ) : (
            <FactoryViewed
              projectId={projectId}
              view={view}
              section={section}
              errors={listing.data?.errors ?? []}
            >
              {children}
            </FactoryViewed>
          )}
        </div>
      </div>
    </section>
  );
}

/** A project with a view: its heading, any declaration that failed, then the page. */
function FactoryViewed({
  projectId,
  view,
  section,
  errors,
  children,
}: {
  projectId: string;
  view: FactoryViewListed;
  section: FactorySection;
  errors: FactoryViews['errors'];
  children: FactoryFrameProps['children'];
}): ReactElement {
  const attention = useSectionAttention();
  const waiting = attention.data === undefined ? undefined : needsYou(attention.data.items).length;
  // Read here, where a view applies: the route answers 404 for a project without one.
  const overview = useFactoryRead<FactoryOverviewRead>(K.factoryOverview(projectId), within =>
    within(signal => skill.getFactoryOverview({ codebaseId: projectId }, { signal }))
  );
  return (
    <>
      <FactoryHeading
        projectId={projectId}
        view={view}
        section={section}
        waiting={waiting}
        overview={overview}
      />
      <FactoryErrors errors={[...errors, ...(overview.data?.errors ?? [])]} />
      {children(view, attention)}
    </>
  );
}

/** A project no view applies to, or whose views have not loaded. */
function FactoryAbsent({
  projectId,
  listing: read,
}: {
  projectId: string;
  listing: EntityView<FactoryViews>;
}): ReactNode {
  const listing = read.data;
  const failed = readFailed(read.error);
  if (failed !== undefined)
    return <EmptyState title="The factory view could not be loaded" hint={failed.message} />;
  if (listing === undefined) return <FactoryLoading read={read} />;
  // A broken project file already shows above; an empty state under it would contradict it.
  if (listing.errors.some(error => error.source === 'project-file')) return null;
  return (
    <EmptyState
      title="No factory view applies to this project"
      hint="A project shows its factory once it runs a pack that declares a factory view, or ships its own in .archon/packs/."
      action={
        <Link
          to={`/console/p/${projectId}`}
          className="text-console-12 text-accent-bright underline"
        >
          Back to runs
        </Link>
      }
    />
  );
}

const SECTIONS: readonly {
  key: Exclude<FactorySection, null | 'how-it-works'>;
  label: string;
  rest: string;
}[] = [
  { key: 'overview', label: 'Overview', rest: '' },
  { key: 'board', label: 'Board', rest: '/board' },
  { key: 'needs-you', label: 'Needs you', rest: '/needs-you' },
];

function FactoryHeading({
  projectId,
  view,
  section,
  waiting,
  overview,
}: {
  projectId: string;
  view: FactoryViewListed;
  section: FactorySection;
  /** How many open asks and waits need a person; undefined until the queue loads. */
  waiting: number | undefined;
  /** The pack's overview file, read; its entry shows when there is one, a broken one, or the read failed. */
  overview: EntityView<FactoryOverviewRead>;
}): ReactElement {
  const hasOverview = howItWorksShown(overview);
  return (
    <div className="flex max-w-5xl flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-medium text-text-primary">{view.declaration.title}</h2>
        {/* The summary introduces the factory once, on the Overview; the other pages need
            their first screen for the board, the item or the graph. */}
        {section === 'overview' ? <ClampedSummary text={view.declaration.summary} /> : null}
      </div>
      <nav aria-label="Factory" className="flex items-center gap-1">
        {SECTIONS.map(({ key, label, rest }) => (
          <SectionLink
            key={key}
            to={factoryPath(projectId, rest)}
            label={label}
            active={key === section}
            count={key === 'needs-you' ? waiting : undefined}
          />
        ))}
        {hasOverview ? (
          <SectionLink
            to={factoryPath(projectId, '/how-it-works')}
            label="How it works"
            active={section === 'how-it-works'}
          />
        ) : null}
      </nav>
    </div>
  );
}

/** One sub-navigation entry; a count, while above zero, shows in the page's one loud colour. */
function SectionLink({
  to,
  label,
  active,
  count,
}: {
  to: string;
  label: string;
  active: boolean;
  /** How many wait on a person, for Needs you; undefined for the others and until it loads. */
  count?: number;
}): ReactElement {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-1.5 rounded px-2 py-1 text-console-12 font-medium transition-colors ${
        active
          ? 'bg-surface-elevated text-text-primary'
          : 'text-text-tertiary hover:text-text-primary'
      }`}
    >
      {label}
      {count === undefined || count === 0 ? null : (
        <span
          aria-label={`${count.toString()} waiting`}
          className="rounded-full bg-warning/20 px-1.5 text-console-11 font-semibold text-warning"
        >
          {count}
        </span>
      )}
    </Link>
  );
}

/** View and overview files that failed, each with its file, so a broken one is never silent. */
function FactoryErrors({ errors }: { errors: FactoryViews['errors'] }): ReactNode {
  if (errors.length === 0) return null;
  return (
    <div
      role="alert"
      className="flex max-w-5xl flex-col gap-2 rounded-console-12 border border-error/30 bg-error/10 px-4 py-3"
    >
      <p className="text-console-12 font-medium text-error">
        {errors.length === 1
          ? 'A factory file could not be read'
          : `${errors.length.toString()} factory files could not be read`}
      </p>
      <ul className="flex flex-col gap-1">
        {errors.map(error => (
          <li key={`${error.source}:${error.path}`} className="text-console-12 text-text-secondary">
            <span className="break-all font-mono text-console-11 text-text-primary">
              {error.path}
            </span>
            <span className="block break-words">{error.error}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

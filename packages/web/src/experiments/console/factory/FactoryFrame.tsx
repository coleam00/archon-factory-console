import type { ReactElement, ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { EmptyState } from '../components/EmptyState';
import { ProjectHeader } from '../components/ProjectHeader';
import { useProjectAttention } from '../components/ProjectAttention';
import { ProjectViewTabs, WaitingBadge } from '../components/ProjectViewTabs';
import type { Project } from '../primitives/project';
import * as skill from '../skills';
import type { FactoryPacksRead, FactoryViews } from '../skills/factory';
import type { AttentionQueue } from '../skills/runs';
import type { EntityView } from '../store/cache';
import { K } from '../store/keys';
import { ClampedSummary } from './ClampedSummary';
import { useFactoryPacks } from './useFactoryPacks';
import { useFactoryRead } from './useFactoryRead';
import { useFactoryViews } from './useFactoryViews';
import { readFailed, SlowReadError } from './lib/deadline';
import { needsYouCount, needsYouPath } from '../lib/needs-you';
import { howItWorksShown } from './lib/overview-nav';
import { currentView, factoryPackPath, factoryPath, type FactoryViewListed } from './lib/views';
import { FactoryLoading, SLOW_READ_NOTICE } from './FactoryLoading';

/** The sub-navigation entry a page sits under; item, stage and step pages sit under none. */
export type FactorySection = 'overview' | 'board' | null;

interface FactoryFrameProps {
  section: FactorySection;
  /** Let the page use the full width, as the board's columns need; others keep a reading width. */
  wide?: boolean;
  /**
   * From md up, give the page the height left under the sub-navigation, so its own parts
   * scroll instead of the page (the board's columns). The frame still scrolls when a window
   * is too short for the page's minimum height. Below md the page scrolls as others do.
   */
  fill?: boolean;
  /**
   * The page body, drawn under the view's header once a view applies, with the project's
   * attention queue: the project's one read (`useProjectAttention`), so the count and a page's
   * cards share one fetch and stream.
   */
  children: (view: FactoryViewListed, attention: EntityView<AttentionQueue>) => ReactNode;
}

/**
 * Every Factory page's frame: the project heading and tabs, then the factory view's title,
 * summary and sub-navigation, any declaration that failed, and the page. A project no view
 * applies to gets an empty state instead.
 */
export function FactoryFrame({
  section,
  wide = false,
  fill = false,
  children,
}: FactoryFrameProps): ReactElement {
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
      <div
        className={`flex-1 overflow-y-auto px-4 pb-7.5 pt-5.5 md:px-7.5 ${fill ? 'md:flex md:min-h-0 md:flex-col' : ''}`}
      >
        <div
          className={`flex flex-col gap-5 ${wide ? '' : 'max-w-5xl'} ${fill ? 'md:min-h-0 md:flex-1' : ''}`}
        >
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
  const attention = useProjectAttention();
  const waiting = attention.data === undefined ? undefined : needsYouCount(attention.data);
  const packs = useFactoryPacks();
  return (
    <>
      <FactoryHeading
        projectId={projectId}
        view={view}
        section={section}
        waiting={waiting}
        packs={packs}
      />
      <FactoryErrors errors={errors} />
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
  key: Exclude<FactorySection, null>;
  label: string;
  rest: string;
}[] = [
  { key: 'overview', label: 'Overview', rest: '' },
  { key: 'board', label: 'Board', rest: '/board' },
];

function FactoryHeading({
  projectId,
  view,
  section,
  waiting,
  packs,
}: {
  projectId: string;
  view: FactoryViewListed;
  section: FactorySection;
  /** How many open asks and waits need a person; undefined until the queue loads. */
  waiting: number | undefined;
  /**
   * Every pack with an overview file. How it works shows when the view's pack is listed or
   * the read failed, and opens the pack's page in the sidebar: it explains the pack, so it is
   * never this project's current page, and its file errors show there.
   */
  packs: EntityView<FactoryPacksRead>;
}): ReactElement {
  const hasOverview = howItWorksShown(packs, view.packKey);
  return (
    <div className="flex max-w-5xl flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-medium text-text-primary">{view.declaration.title}</h2>
        {/* The summary introduces the factory once, on the Overview; the other pages need
            their first screen for the board, the item or the graph. */}
        {section === 'overview' ? (
          // Keyed by the text, so a new summary measures again and opens clamped.
          <ClampedSummary key={view.declaration.summary} text={view.declaration.summary} />
        ) : null}
      </div>
      <nav aria-label="Factory" className="flex items-center gap-1">
        {SECTIONS.map(({ key, label, rest }) => (
          <SectionLink
            key={key}
            to={factoryPath(projectId, rest)}
            label={label}
            active={key === section}
          />
        ))}
        {/* Needs you is a project tab, not a Factory page; the link takes its count along. */}
        <SectionLink
          to={needsYouPath(projectId)}
          label="Needs you"
          active={false}
          count={waiting}
        />
        {hasOverview ? (
          <SectionLink to={factoryPackPath(view.packKey)} label="How it works" active={false} />
        ) : null}
      </nav>
    </div>
  );
}

/** One sub-navigation entry; a count, while above zero, shows as the soft needs-you chip. */
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
      {count === undefined || count === 0 ? null : <WaitingBadge count={count} />}
    </Link>
  );
}

/** View and overview files that failed, each with its file, so a broken one is never silent. */
export function FactoryErrors({ errors }: { errors: FactoryViews['errors'] }): ReactNode {
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

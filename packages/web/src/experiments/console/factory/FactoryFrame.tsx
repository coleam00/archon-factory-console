import type { ReactElement, ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { EmptyState } from '../components/EmptyState';
import { ProjectHeader } from '../components/ProjectHeader';
import { ProjectViewTabs } from '../components/ProjectViewTabs';
import type { Project } from '../primitives/project';
import * as skill from '../skills';
import type { FactoryViews } from '../skills/factory';
import type { AttentionQueue } from '../skills/runs';
import { useEntity, type EntityView } from '../store/cache';
import { K } from '../store/keys';
import { useFactoryAttention } from './attention-stream';
import { needsYou } from './lib/needs-you';
import { currentView, factoryPath, type FactoryViewListed } from './lib/views';

/** The sub-navigation entry a page sits under; item, stage and step pages sit under none. */
export type FactorySection = 'overview' | 'board' | null;

interface FactoryFrameProps {
  section: FactorySection;
  /** Let the page use the full width, as the board's columns need; others keep a reading width. */
  wide?: boolean;
  /**
   * The page body, drawn under the view's header once a view applies, with the project's
   * attention queue: read once here, so the count and a page's list share one fetch and stream.
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
  const { data: project } = useEntity<Project>(K.project(projectId), () =>
    skill.getProject(projectId)
  );
  const listing = useEntity<FactoryViews>(K.factoryViews(projectId), () =>
    skill.getFactoryViews({ codebaseId: projectId })
  );
  const view = currentView(listing.data);
  return (
    <section className="flex h-full flex-col">
      <ProjectHeader title={project?.name ?? 'Project'} subtitle={project?.path ?? 'Loading…'}>
        <ProjectViewTabs projectId={projectId} active="factory" />
      </ProjectHeader>
      <div className="flex-1 overflow-y-auto px-4 pb-7.5 pt-5.5 md:px-7.5">
        <div className={`flex flex-col gap-5 ${wide ? '' : 'max-w-5xl'}`}>
          {view === undefined ? (
            <>
              <FactoryErrors errors={listing.data?.errors ?? []} />
              <FactoryAbsent projectId={projectId} listing={listing.data} failed={listing.error} />
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
  const attention = useFactoryAttention(projectId);
  const waiting = attention.data === undefined ? undefined : needsYou(attention.data.items).length;
  return (
    <>
      <FactoryHeading projectId={projectId} view={view} section={section} waiting={waiting} />
      <FactoryErrors errors={errors} />
      {children(view, attention)}
    </>
  );
}

/** A project no view applies to, or whose views have not loaded. */
function FactoryAbsent({
  projectId,
  listing,
  failed,
}: {
  projectId: string;
  listing: FactoryViews | undefined;
  failed: Error | undefined;
}): ReactNode {
  if (failed !== undefined)
    return <EmptyState title="The factory view could not be loaded" hint={failed.message} />;
  if (listing === undefined) return <p className="text-xs text-text-tertiary">Loading…</p>;
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

const SECTIONS: readonly { key: Exclude<FactorySection, null>; label: string; rest: string }[] = [
  { key: 'overview', label: 'Overview', rest: '' },
  { key: 'board', label: 'Board', rest: '/board' },
  // Needs you is a section of the Overview, not a page of its own, so it is never active.
];

function FactoryHeading({
  projectId,
  view,
  section,
  waiting,
}: {
  projectId: string;
  view: FactoryViewListed;
  section: FactorySection;
  /** How many open asks and waits need a person; undefined until the queue loads. */
  waiting: number | undefined;
}): ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-medium text-text-primary">{view.declaration.title}</h2>
        {/* The summary introduces the factory once, on the Overview; the other pages need
            their first screen for the board, the item or the graph. */}
        {section === 'overview' ? (
          <p className="max-w-3xl text-sm leading-relaxed text-text-secondary">
            {view.declaration.summary}
          </p>
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
        <NeedsYouLink projectId={projectId} waiting={waiting} />
      </nav>
    </div>
  );
}

/** The Needs-you entry, with its count in the page's one loud colour while anything waits. */
function NeedsYouLink({
  projectId,
  waiting,
}: {
  projectId: string;
  waiting: number | undefined;
}): ReactElement {
  return (
    <Link
      to={factoryPath(projectId, '#needs-you')}
      className="flex items-center gap-1.5 rounded px-2 py-1 text-console-12 font-medium text-text-tertiary transition-colors hover:text-text-primary"
    >
      Needs you
      {waiting === undefined || waiting === 0 ? null : (
        <span
          aria-label={`${waiting.toString()} waiting`}
          className="rounded-full bg-warning/20 px-1.5 text-console-11 font-semibold text-warning"
        >
          {waiting}
        </span>
      )}
    </Link>
  );
}

function SectionLink({
  to,
  label,
  active,
}: {
  to: string;
  label: string;
  active: boolean;
}): ReactElement {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={`rounded px-2 py-1 text-console-12 font-medium transition-colors ${
        active
          ? 'bg-surface-elevated text-text-primary'
          : 'text-text-tertiary hover:text-text-primary'
      }`}
    >
      {label}
    </Link>
  );
}

/** Declarations that failed, each with its file, so a broken one is never silent. */
function FactoryErrors({ errors }: { errors: FactoryViews['errors'] }): ReactNode {
  if (errors.length === 0) return null;
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-console-12 border border-error/30 bg-error/10 px-4 py-3"
    >
      <p className="text-console-12 font-medium text-error">
        {errors.length === 1
          ? 'A factory view declaration could not be read'
          : `${errors.length.toString()} factory view declarations could not be read`}
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

import type { ReactElement, ReactNode } from 'react';
import type { FactoryPacksRead } from '../api';
import { FactoryErrors } from '../FactoryFrame';

/**
 * What the packs read could not see across the install: files no pack could be told from, and
 * projects whose checkout could not be read. Either can hide a pack, so every sidebar Factory
 * page says so above its own content instead of leaving the list looking complete.
 */
export function ListingProblems({ listing }: { listing: FactoryPacksRead }): ReactElement {
  return (
    <>
      <FactoryErrors errors={listing.errors} />
      <UnreadProjects projects={listing.unreadProjects} />
    </>
  );
}

function UnreadProjects({ projects }: { projects: FactoryPacksRead['unreadProjects'] }): ReactNode {
  if (projects.length === 0) return null;
  return (
    <div
      role="alert"
      className="flex max-w-5xl flex-col gap-1 rounded-console-12 border border-warning/30 bg-warning/10 px-4 py-3"
    >
      <p className="text-console-13 font-medium text-warning">
        Some projects could not be read, so a pack they present may be missing
      </p>
      <ul className="flex flex-col gap-1">
        {projects.map(project => (
          <li key={project.codebaseId} className="text-console-13 text-text-secondary">
            <span className="text-text-primary">{project.name}</span>: {project.error}
          </li>
        ))}
      </ul>
    </div>
  );
}

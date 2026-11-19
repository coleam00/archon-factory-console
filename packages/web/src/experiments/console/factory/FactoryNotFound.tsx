import type { ReactElement } from 'react';
import { FileQuestionMark } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { EmptyNote } from '../components/EmptyNote';
import { BackLink } from './BackLink';
import { FactoryFrame } from './FactoryFrame';
import { needsYouPath } from '../lib/needs-you';
import { factoryPath } from './lib/views';

/** Every page of the section, and the project's Needs you tab, linked from a path it does not have. */
const PAGES: readonly { label: string; to: (projectId: string) => string }[] = [
  { label: 'Overview', to: projectId => factoryPath(projectId) },
  { label: 'Board', to: projectId => factoryPath(projectId, '/board') },
  { label: 'Needs you', to: needsYouPath },
  // Linked even without an overview file: How it works then says the pack has none.
  { label: 'How it works', to: projectId => factoryPath(projectId, '/how-it-works') },
];

/**
 * `/console/p/:projectId/factory/*`: any path the section does not have. It stays inside the
 * section, with the project and its view, rather than dropping to All projects.
 */
export function FactoryNotFound(): ReactElement {
  const { projectId = '' } = useParams<{ projectId: string }>();
  return (
    <FactoryFrame section={null}>
      {() => (
        <div className="flex flex-col gap-6">
          <BackLink to={factoryPath(projectId)} label="Overview" />
          <EmptyNote
            icon={FileQuestionMark}
            sentence="No page here. The Factory has these pages:"
            link={
              <nav aria-label="Factory pages" className="flex flex-wrap items-center gap-3">
                {PAGES.map(({ label, to }) => (
                  <Link
                    key={label}
                    to={to(projectId)}
                    className="text-accent-bright transition-colors duration-150 ease-out hover:underline"
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            }
          />
        </div>
      )}
    </FactoryFrame>
  );
}

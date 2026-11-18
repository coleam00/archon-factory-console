import type { ReactElement } from 'react';
import { Link, useParams } from 'react-router';
import { FactoryFrame } from './FactoryFrame';
import { factoryPath } from './lib/views';

/** Every page of the section, linked from a path it does not have. */
const PAGES: readonly { label: string; rest: string }[] = [
  { label: 'Overview', rest: '' },
  { label: 'Board', rest: '/board' },
  { label: 'Needs you', rest: '/needs-you' },
  // Linked even without an overview file: How it works then says the pack has none.
  { label: 'How it works', rest: '/how-it-works' },
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
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">No page here.</p>
          <nav aria-label="Factory pages" className="flex flex-wrap items-center gap-3">
            {PAGES.map(({ label, rest }) => (
              <Link
                key={label}
                to={factoryPath(projectId, rest)}
                className="text-console-12 text-accent-bright underline"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </FactoryFrame>
  );
}

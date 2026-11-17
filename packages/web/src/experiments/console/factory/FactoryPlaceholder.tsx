import type { ReactElement, ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { FactoryFrame } from './FactoryFrame';
import { factoryPath } from './lib/views';

/** The Factory pages not built yet, by route. */
export type FactoryPlaceholderPage = 'board' | 'item' | 'stage' | 'step';

/** A Factory route whose page comes in a later slice: says which page, and leads back. */
export function FactoryPlaceholder({ page }: { page: FactoryPlaceholderPage }): ReactElement {
  const { projectId = '' } = useParams<{ projectId: string }>();
  return (
    <FactoryFrame section={page === 'board' ? 'board' : null}>
      {() => (
        <div className="flex flex-col items-start gap-3 rounded-console-12 border border-border bg-surface px-5 py-4">
          <p className="text-sm text-text-primary">
            <PageName page={page} /> is coming next.
          </p>
          <Link
            to={factoryPath(projectId)}
            className="text-console-12 text-accent-bright underline"
          >
            Back to the overview
          </Link>
        </div>
      )}
    </FactoryFrame>
  );
}

function PageName({ page }: { page: FactoryPlaceholderPage }): ReactNode {
  const params = useParams<{ key: string; stage: string; workflow: string; node: string }>();
  const mono = (text: string): ReactElement => (
    <span className="font-mono text-console-12">{text}</span>
  );
  switch (page) {
    case 'board':
      return 'The board';
    case 'item':
      return <>Item {mono(params.key ?? '')}</>;
    case 'stage':
      return <>Stage {mono(params.stage ?? '')}</>;
    case 'step':
      return <>Step {mono(`${params.workflow ?? ''} · ${params.node ?? ''}`)}</>;
  }
}

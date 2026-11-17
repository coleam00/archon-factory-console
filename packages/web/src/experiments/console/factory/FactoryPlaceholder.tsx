import type { ReactElement } from 'react';
import { useParams } from 'react-router';
import { BackLink } from './BackLink';
import { FactoryFrame } from './FactoryFrame';
import { factoryPath } from './lib/views';

/** The Factory pages not built yet, by route. */
export type FactoryPlaceholderPage = 'board';

/** A Factory route whose page comes in a later slice: says which page, and leads back. */
export function FactoryPlaceholder({ page }: { page: FactoryPlaceholderPage }): ReactElement {
  const { projectId = '' } = useParams<{ projectId: string }>();
  return (
    <FactoryFrame section={page}>
      {() => (
        <div className="flex flex-col items-start gap-3 rounded-console-12 border border-border bg-surface px-5 py-4">
          <p className="text-sm text-text-primary">The board is coming next.</p>
          <BackLink to={factoryPath(projectId)} label="Back to the overview" />
        </div>
      )}
    </FactoryFrame>
  );
}

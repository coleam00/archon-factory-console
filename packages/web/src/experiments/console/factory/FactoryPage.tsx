import type { ReactElement } from 'react';
import { useParams } from 'react-router';
import { FactoryFrame } from './FactoryFrame';
import { FactoryNumbers } from './FactoryNumbers';
import { NeedsYouList } from './NeedsYouList';

/** `/console/p/:projectId/factory`: what this factory does, its numbers, what needs a person. */
export function FactoryPage(): ReactElement {
  const { projectId = '' } = useParams<{ projectId: string }>();
  return (
    <FactoryFrame section="overview">
      {/* The map goes under this list in its own slice. */}
      {(view, attention) => (
        <>
          <FactoryNumbers projectId={projectId} view={view.declaration} />
          <NeedsYouList projectId={projectId} attention={attention} />
        </>
      )}
    </FactoryFrame>
  );
}

import type { ReactElement } from 'react';
import { useParams } from 'react-router';
import { FactoryFrame } from './FactoryFrame';
import { NeedsYouList } from './NeedsYouList';

/** `/console/p/:projectId/factory`: what this factory does, then what needs a person. */
export function FactoryPage(): ReactElement {
  const { projectId = '' } = useParams<{ projectId: string }>();
  return (
    <FactoryFrame section="overview">
      {/* The numbers strip and the map go around this list in their own slices. */}
      {(_view, attention) => <NeedsYouList projectId={projectId} attention={attention} />}
    </FactoryFrame>
  );
}

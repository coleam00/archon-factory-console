import type { ReactElement } from 'react';
import { useParams } from 'react-router';
import { FactoryFrame } from './FactoryFrame';
import { FactoryNumbers } from './FactoryNumbers';
import { FactoryMap } from './map/FactoryMap';
import { NeedsYouList } from './NeedsYouList';

/** `/console/p/:projectId/factory`: what this factory does, its numbers, what needs a person, then the map. */
export function FactoryPage(): ReactElement {
  const { projectId = '' } = useParams<{ projectId: string }>();
  return (
    // Wide: the map takes the page's whole width; the text above it keeps its own measure.
    <FactoryFrame section="overview" wide>
      {(view, attention) => (
        <>
          <FactoryNumbers projectId={projectId} view={view.declaration} />
          <NeedsYouList projectId={projectId} attention={attention} />
          <FactoryMap projectId={projectId} view={view.declaration} attention={attention} />
        </>
      )}
    </FactoryFrame>
  );
}

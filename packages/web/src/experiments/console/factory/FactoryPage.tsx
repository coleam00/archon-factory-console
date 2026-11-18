import type { ReactElement } from 'react';
import { useParams } from 'react-router';
import { needsYouCount } from '../lib/needs-you';
import { FactoryFrame } from './FactoryFrame';
import { FactoryNumbers } from './FactoryNumbers';
import { FactoryMap } from './map/FactoryMap';
import { OverviewAsks } from './OverviewAsks';

/** `/console/p/:projectId/factory`: what this factory does, its numbers, what needs a person, then the map. */
export function FactoryPage(): ReactElement {
  const { projectId = '' } = useParams<{ projectId: string }>();
  return (
    // Wide: the map takes the page's whole width; the text above it keeps its own measure.
    <FactoryFrame section="overview" wide>
      {(view, attention) => (
        <>
          <FactoryNumbers
            projectId={projectId}
            view={view.declaration}
            waiting={attention.data === undefined ? undefined : needsYouCount(attention.data)}
          />
          <OverviewAsks projectId={projectId} view={view} attention={attention} />
          <FactoryMap projectId={projectId} view={view} attention={attention} />
        </>
      )}
    </FactoryFrame>
  );
}

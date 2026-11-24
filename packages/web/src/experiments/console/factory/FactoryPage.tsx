import type { ReactElement } from 'react';
import { useParams } from 'react-router';
import { FactoryFrame } from './FactoryFrame';
import { FactoryNumbers } from './FactoryNumbers';
import { FactoryMap } from './map/FactoryMap';
import { OverviewAsks } from './OverviewAsks';
import { factoryWaitingCount } from './lib/attention';
import { useFactoryItems } from './useFactoryItems';
import { useItemAsks } from './useItemAsks';

/** `/console/p/:projectId/factory`: what this factory does, its numbers, what needs a person, then the map. */
export function FactoryPage(): ReactElement {
  const { projectId = '' } = useParams<{ projectId: string }>();
  // The items the numbers and the map read already: Need you counts their asks and those
  // waiting on you, with the project's asks from Archon's attention read.
  const items = useFactoryItems(projectId);
  const asks = useItemAsks(projectId);
  return (
    // Wide: the map takes the page's whole width; the text above it keeps its own measure.
    <FactoryFrame section="overview" wide>
      {view => (
        <>
          <FactoryNumbers
            projectId={projectId}
            view={view.declaration}
            waiting={
              asks.read.data === undefined || items.data === undefined
                ? undefined
                : factoryWaitingCount(items.data, asks.asks)
            }
          />
          <OverviewAsks
            projectId={projectId}
            view={view.declaration}
            items={items.data}
            asks={asks}
          />
          <FactoryMap projectId={projectId} view={view} asks={asks.asks} />
        </>
      )}
    </FactoryFrame>
  );
}

import type { ReactElement } from 'react';
import { Navigate, Route, useLocation, useParams } from 'react-router';
import { BoardPage } from './BoardPage';
import { FactoryNotFound } from './FactoryNotFound';
import { FactoryPage } from './FactoryPage';
import { ItemPage } from './ItemPage';
import { NeedsYouPage } from './NeedsYouPage';
import { OverviewPage } from './overview/OverviewPage';
import { StagePage } from './StagePage';
import { StepPage } from './StepPage';
import { FactorySectionLayout } from './section-attention';
import { factoryPath } from './lib/views';

/**
 * The Factory section's routes, under one parent that shares the attention stream. A function
 * returning a `<Route>` rather than a component, because `<Routes>` reads its children's
 * route elements directly. `base` is what precedes `p/:projectId/factory`: the console nests
 * it under `/console/*`, a test mounts it at the root.
 */
export function factoryRoutes(base: '' | '/console/'): ReactElement {
  return (
    <Route path={`${base}p/:projectId/factory`} element={<FactorySectionLayout />}>
      <Route index element={<FactoryPage />} />
      <Route path="board" element={<BoardPage />} />
      <Route path="needs-you" element={<NeedsYouPage />} />
      <Route path="how-it-works" element={<OverviewPage />} />
      <Route path="overview" element={<OverviewMoved />} />
      <Route path="items/:key" element={<ItemPage />} />
      <Route path="stages/:stage" element={<StagePage />} />
      <Route path="steps/:workflow/:node" element={<StepPage />} />
      <Route path="*" element={<FactoryNotFound />} />
    </Route>
  );
}

/** How it works was `factory/overview`; links to the old address, drill-down included, still land. */
function OverviewMoved(): ReactElement {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { search, hash } = useLocation();
  return (
    <Navigate replace to={{ pathname: factoryPath(projectId, '/how-it-works'), search, hash }} />
  );
}

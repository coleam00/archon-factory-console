import type { ReactElement } from 'react';
import { Route } from 'react-router';
import { BoardPage } from './BoardPage';
import { FactoryPage } from './FactoryPage';
import { ItemPage } from './ItemPage';
import { NeedsYouPage } from './NeedsYouPage';
import { OverviewPage } from './overview/OverviewPage';
import { StagePage } from './StagePage';
import { StepPage } from './StepPage';
import { FactorySectionLayout } from './section-attention';

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
      <Route path="overview" element={<OverviewPage />} />
      <Route path="items/:key" element={<ItemPage />} />
      <Route path="stages/:stage" element={<StagePage />} />
      <Route path="steps/:workflow/:node" element={<StepPage />} />
    </Route>
  );
}

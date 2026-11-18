import type { ReactElement } from 'react';
import { Navigate, Route, useLocation, useParams } from 'react-router';
import { needsYouPath } from '../lib/needs-you';
import { BoardPage } from './BoardPage';
import { FactoryNotFound } from './FactoryNotFound';
import { FactoryPage } from './FactoryPage';
import { ItemPage } from './ItemPage';
import { OverviewPage } from './overview/OverviewPage';
import { StagePage } from './StagePage';
import { StepPage } from './StepPage';
import { factoryPath } from './lib/views';

/**
 * The Factory section's routes, a child of the project's route (`projectRoutes`), whose
 * layout shares the attention stream. A function returning a `<Route>` rather than a
 * component, because `<Routes>` reads its children's route elements directly.
 */
export function factoryRoutes(): ReactElement {
  return (
    <Route path="factory">
      <Route index element={<FactoryPage />} />
      <Route path="board" element={<BoardPage />} />
      <Route path="needs-you" element={<NeedsYouMoved />} />
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

/** Needs you was `factory/needs-you`; it is a project tab now, and old links still land there. */
function NeedsYouMoved(): ReactElement {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { search, hash } = useLocation();
  return <Navigate replace to={{ pathname: needsYouPath(projectId), search, hash }} />;
}

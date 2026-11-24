import type { ReactElement } from 'react';
import { Navigate, Route, useLocation, useParams } from 'react-router';
import { needsYouPath } from '../lib/needs-you';
import { BoardPage } from './BoardPage';
import { FactoryFrame } from './FactoryFrame';
import { FactoryNotFound } from './FactoryNotFound';
import { FactoryPage } from './FactoryPage';
import { ItemPage } from './ItemPage';
import { StagePage } from './StagePage';
import { StepPage } from './StepPage';
import { ProjectSettingsPage } from './settings/ProjectSettingsPage';
import { factoryPackPath } from './lib/views';

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
      <Route path="settings" element={<ProjectSettingsPage />} />
      <Route path="needs-you" element={<NeedsYouMoved />} />
      <Route path="how-it-works" element={<HowItWorksMoved />} />
      <Route path="overview" element={<HowItWorksMoved />} />
      <Route path="items/:key" element={<ItemPage />} />
      <Route path="stages/:stage" element={<StagePage />} />
      <Route path="steps/:workflow/:node" element={<StepPage />} />
      <Route path="*" element={<FactoryNotFound />} />
    </Route>
  );
}

/**
 * How it works explains a pack, not a project, so it lives in the sidebar
 * (`/console/factory/:pack/how-it-works`). Its old project addresses, `factory/how-it-works`
 * and the older `factory/overview`, replace themselves with the page for the pack the
 * project's view draws, drill-down kept, in one hop. The frame answers a project no view
 * applies to; the pack page answers a pack with no overview file.
 */
function HowItWorksMoved(): ReactElement {
  return (
    <FactoryFrame section={null}>{view => <ToPackPage packKey={view.packKey} />}</FactoryFrame>
  );
}

function ToPackPage({ packKey }: { packKey: string }): ReactElement {
  const { search, hash } = useLocation();
  return <Navigate replace to={{ pathname: factoryPackPath(packKey), search, hash }} />;
}

/** Needs you was `factory/needs-you`; it is a project tab now, and old links still land there. */
function NeedsYouMoved(): ReactElement {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { search, hash } = useLocation();
  return <Navigate replace to={{ pathname: needsYouPath(projectId), search, hash }} />;
}

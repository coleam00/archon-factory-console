import type { ReactElement } from 'react';
import { Navigate, Route } from 'react-router';
import { BuilderConnected } from '../builder/BuilderConnected';
import { factoryPackRoutes } from '../factory/packs/routes';
import { MetricsPage } from './metrics/MetricsPage';
import { PreviewPage } from './PreviewPage';
import { projectRoutes } from './project-routes';
import { RunDetailPage } from './RunDetailPage';
import { RunsPage } from './RunsPage';
import { SettingsPage } from './SettingsPage';

/**
 * Every console page, relative to `/console/*` where the app mounts the console. A function
 * returning `<Route>`s rather than a component, because `<Routes>` reads its children's route
 * elements directly. Tests mount this same list, so a page missing here fails them.
 */
export function consoleRoutes(): ReactElement {
  return (
    <>
      <Route index element={<RunsPage />} />
      <Route path="metrics" element={<MetricsPage />} />
      <Route path="metrics/details" element={<MetricsPage view="details" />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="builder" element={<BuilderConnected />} />
      <Route path="builder/:name" element={<BuilderConnected />} />
      <Route path="_preview" element={<PreviewPage />} />
      <Route path="r/:runId" element={<RunDetailPage />} />
      <Route path="*" element={<Navigate to="/console" replace />} />
      {projectRoutes('')}
      {factoryPackRoutes('')}
    </>
  );
}

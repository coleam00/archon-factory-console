import type { ReactElement } from 'react';
import { Route } from 'react-router';
import { factoryRoutes } from './routes';

/**
 * The Factory section's routes under a project, as the console mounts them, for a test that
 * draws its pages by address. A function returning a `<Route>`, as `factoryRoutes` is.
 */
export function factoryTestRoutes(): ReactElement {
  return <Route path="/console/p/:projectId">{factoryRoutes()}</Route>;
}

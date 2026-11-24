import type { ReactElement } from 'react';
import { Route } from 'react-router';
import { BoardPage } from './BoardPage';
import { FactoryNotFound } from './FactoryNotFound';
import { FactoryPage } from './FactoryPage';
import { ItemPage } from './ItemPage';

/**
 * The Factory section's routes under a project. A function returning a `<Route>` rather than a
 * component, because `<Routes>` reads its children's route elements directly. `base` is what
 * precedes `p/`: the console nests it under `/console/*`, a test mounts it at `/console/`.
 */
export function factoryRoutes(base: '' | '/console/'): ReactElement {
  return (
    <Route path={`${base}p/:projectId/factory`}>
      <Route index element={<FactoryPage />} />
      <Route path="board" element={<BoardPage />} />
      <Route path="items/:key" element={<ItemPage />} />
      <Route path="*" element={<FactoryNotFound />} />
    </Route>
  );
}

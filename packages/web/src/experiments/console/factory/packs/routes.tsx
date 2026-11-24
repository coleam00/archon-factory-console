import type { ReactElement } from 'react';
import { Navigate, Route } from 'react-router';
import { PackIndexPage } from './PackIndexPage';
import { PackPage } from './PackPage';

/**
 * The sidebar's Factory pages: every pack, then one pack's How it works. A function returning a
 * `<Route>`, as `factoryRoutes` is, so `<Routes>` reads its children directly. `base` is
 * what precedes `factory`: the console nests it under `/console/*`, a test mounts it at
 * `/console/`.
 */
export function factoryPackRoutes(base: '' | '/console/'): ReactElement {
  return (
    <Route path={`${base}factory`}>
      <Route index element={<PackIndexPage />} />
      <Route path=":pack" element={<Navigate replace to="how-it-works" />} />
      <Route path=":pack/how-it-works" element={<PackPage />} />
    </Route>
  );
}

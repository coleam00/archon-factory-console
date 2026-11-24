/**
 * The web pages the run-records read (`RECORDS_PAGE`) by the route's bound (`RUN_RECORDS_MAX`):
 * a page larger than the bound is a 400, and the whole board read fails with it. `@archon/web`
 * must not import `@archon/workflows`, so the two constants cannot be one; this test keeps them
 * in step, from `scripts/` for the reason `node-ref-parity.test.ts` gives.
 */
import { expect, test } from 'bun:test';
import { RECORDS_PAGE } from '../packages/web/src/experiments/console/factory/lib/factory-derive';
import { RUN_RECORDS_MAX } from '../packages/workflows/src/run-records';

test("the web's records page is the route's bound", () => {
  expect(RECORDS_PAGE).toBe(RUN_RECORDS_MAX);
});

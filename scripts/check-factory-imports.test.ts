import { expect, test } from 'bun:test';
import { ALLOWED_IMPORTERS, factoryImportViolations } from './check-factory-imports';

const OUTSIDE = 'experiments/console/routes/RunsPage.tsx';

test('an import of factory code from any other file is a violation, whatever its form', () => {
  const text = [
    "import { BoardPage } from '../factory/BoardPage';",
    "import type { FK } from '@/experiments/console/factory/keys';",
    "export { factoryRoutes } from '../factory/routes';",
    "const lazy = () => import('../factory/ItemPage');",
  ].join('\n');
  expect(factoryImportViolations([{ path: OUTSIDE, text }])).toEqual([
    `packages/web/src/${OUTSIDE}:1: ../factory/BoardPage`,
    `packages/web/src/${OUTSIDE}:2: @/experiments/console/factory/keys`,
    `packages/web/src/${OUTSIDE}:3: ../factory/routes`,
    `packages/web/src/${OUTSIDE}:4: ../factory/ItemPage`,
  ]);
});

test('a path that only starts like the factory folder is not it', () => {
  const text = "import { x } from '../factory-other/x';";
  expect(factoryImportViolations([{ path: OUTSIDE, text }])).toEqual([]);
});

test('the mounting files and the factory itself may import it', () => {
  const files = [
    ...ALLOWED_IMPORTERS.map(path => ({ path, text: "import { a } from './factory/a';" })),
    {
      path: 'experiments/console/factory/BoardPage.tsx',
      text: "import { FK } from './keys';\nimport { RunsPage } from '../routes/RunsPage';",
    },
  ];
  expect(factoryImportViolations(files)).toEqual([]);
});

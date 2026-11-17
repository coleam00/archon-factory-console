import type { ReactElement } from 'react';
import { FactoryFrame } from './FactoryFrame';

/** `/console/p/:projectId/factory`: what this factory does, then what needs a person. */
export function FactoryPage(): ReactElement {
  return (
    <FactoryFrame section="overview">
      {() => (
        <section id="needs-you" className="flex flex-col gap-1.5">
          <h3 className="text-console-11 font-medium uppercase tracking-wider text-text-tertiary">
            Needs you
          </h3>
          <p className="text-sm text-text-secondary">
            The questions items wait on, the numbers strip and the factory map are coming next.
          </p>
        </section>
      )}
    </FactoryFrame>
  );
}

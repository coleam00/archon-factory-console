import { useRef, useState, type ReactElement } from 'react';
import * as skill from '../../skills';
import type { FactoryWorkflow } from '../../skills/factory';
import type { EntityView } from '../../store/cache';
import { K } from '../../store/keys';
import { readFailed } from '../lib/deadline';
import { retryOnceOnNetworkFailure } from '../lib/network-retry';
import { readFailure } from '../lib/read-failure';
import { useFactoryRead } from '../useFactoryRead';

/** A workflow's steps as the stage graph and the step page read them, and what to show if it failed. */
export interface WorkflowRead {
  read: EntityView<FactoryWorkflow>;
  /** The failure to show, or undefined while there is none to show (loading, or a held old one). */
  failed: Error | undefined;
  retry: () => void;
}

/**
 * The one reader of a workflow's steps (`/api/factory/workflow`), shared by the stage's graph and
 * the step page, so the cache key has one loader. A network failure is tried once more, and a
 * failure is shown with a Retry (`WorkflowReadFailure`). The cache keeps a read's error after its
 * last reader leaves, and a reader that comes back loads again with that error still held, so the
 * error held when this reader mounted, or when Retry was pressed, is dismissed: only a failure of
 * a load this reader waited on shows. (`loading` cannot tell them apart: it still reads true on
 * the render that brings the error.)
 */
export function useFactoryWorkflow(projectId: string, workflow: string): WorkflowRead {
  const read = useFactoryRead<FactoryWorkflow>(K.factoryWorkflow(projectId, workflow), within =>
    retryOnceOnNetworkFailure(() =>
      within(signal => skill.getFactoryWorkflow({ codebaseId: projectId, workflow }, { signal }))
    )
  );
  const dismissed = useRef(read.error);
  const [, rerender] = useState(0);
  const failed = readFailed(read.error);
  return {
    read,
    failed: failed === dismissed.current ? undefined : failed,
    retry: (): void => {
      dismissed.current = read.error;
      rerender(count => count + 1);
      read.refetch();
    },
  };
}

/** What failed reading `workflow`, and a Retry; whatever else the page drew stays drawn. */
export function WorkflowReadFailure({
  workflow,
  error,
  retry,
}: {
  workflow: string;
  error: Error;
  retry: () => void;
}): ReactElement {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3">
      <p className="min-w-0 text-console-14 text-error [overflow-wrap:anywhere]">
        Could not read the workflow <span className="font-mono">{workflow}</span>:{' '}
        {readFailure(error)}
      </p>
      <button
        type="button"
        onClick={retry}
        className="rounded-md border border-border bg-surface px-2.5 py-1 text-console-13 text-text-primary transition-colors duration-150 ease-out hover:bg-surface-hover"
      >
        Retry
      </button>
    </div>
  );
}

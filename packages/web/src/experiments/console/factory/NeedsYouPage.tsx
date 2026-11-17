import type { ReactElement } from 'react';
import { useParams } from 'react-router';
import { FactoryFrame } from './FactoryFrame';
import { NeedsYouList } from './NeedsYouList';

/** `/console/p/:projectId/factory/needs-you`: every open ask and paused wait, answerable in place. */
export function NeedsYouPage(): ReactElement {
  const { projectId = '' } = useParams<{ projectId: string }>();
  return (
    <FactoryFrame section="needs-you">
      {(_view, attention) => <NeedsYouList projectId={projectId} attention={attention} all />}
    </FactoryFrame>
  );
}

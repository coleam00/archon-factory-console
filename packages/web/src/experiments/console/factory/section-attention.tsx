import { createContext, useContext, type ReactElement } from 'react';
import { Outlet, useParams } from 'react-router';
import type { AttentionQueue } from '../skills/runs';
import type { EntityView } from '../store/cache';
import { useFactoryAttention } from './attention-stream';

const SectionAttention = createContext<EntityView<AttentionQueue> | null>(null);

/**
 * The parent route of every Factory page. It holds the project's attention queue and its one
 * stream, so moving between Overview, Board, an item, a stage and a step keeps that stream
 * open instead of closing and reopening it on each page; leaving the section closes it.
 */
export function FactorySectionLayout(): ReactElement {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const attention = useFactoryAttention(projectId);
  return (
    <SectionAttention.Provider value={attention}>
      <Outlet />
    </SectionAttention.Provider>
  );
}

/**
 * The section's attention queue. Outside `FactorySectionLayout` it throws rather than open a
 * stream of its own: a page that quietly opened one would bring back a stream per page.
 */
export function useSectionAttention(): EntityView<AttentionQueue> {
  const attention = useContext(SectionAttention);
  if (attention === null)
    throw new Error('useSectionAttention needs a page routed under FactorySectionLayout');
  return attention;
}

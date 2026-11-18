import type { ReactElement } from 'react';
import { useParams } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { errorDetail } from '../../lib/http';
import { FactoryLoading } from '../FactoryLoading';
import { useFactoryPacks } from '../useFactoryPacks';
import { readFailed } from '../lib/deadline';
import type { FactoryPackListed } from '../lib/views';
import { AllPacksLink, PackFrame, PacksFailed } from './PackFrame';

/**
 * The pack a tab's URL names (`:pack`, its key), from the packs list every sidebar Factory
 * page reads; until it is found, the frame says why (loading, failed, or no such pack), so
 * every tab of a pack agrees on which packs have a page.
 */
export function PackLookup({
  render,
}: {
  render: (pack: FactoryPackListed) => ReactElement;
}): ReactElement {
  const { pack: packKey = '' } = useParams<{ pack: string }>();
  const read = useFactoryPacks();
  const failed = readFailed(read.error);
  const pack = read.data?.packs.find(listed => listed.key === packKey);
  if (pack !== undefined) return render(pack);
  return (
    <PackFrame title="Factory" subtitle={packKey}>
      {failed !== undefined ? (
        <PacksFailed message={errorDetail(failed)} />
      ) : read.data === undefined ? (
        <FactoryLoading read={read} />
      ) : (
        <EmptyState
          title="No factory pack here"
          hint={`No installed pack keyed "${packKey}" has a factory overview file.`}
          action={<AllPacksLink />}
        />
      )}
    </PackFrame>
  );
}

/** A pack page's title: its overview's, else its key. */
export const packTitle = (pack: FactoryPackListed): string =>
  pack.overview?.declaration.title ?? pack.key;

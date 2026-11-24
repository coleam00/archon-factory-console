import type { ReactElement } from 'react';
import { Factory } from 'lucide-react';
import { EmptyNote } from '../ui/EmptyNote';
import { factoryErrorDetail } from '../lib/read-failure';
import { FactoryLoading } from '../FactoryLoading';
import { useFactoryPacks } from '../useFactoryPacks';
import { readFailed } from '../lib/deadline';
import { packDisplayName } from '../lib/pack-name';
import type { FactoryPackListed } from '../lib/views';
import type { FactoryPacksRead } from '../api';
import { ListingProblems } from './ListingProblems';
import { PackFrame, PacksFailed } from './PackFrame';
import { PackSkeleton } from './PackSkeleton';

/**
 * The pack the caller picks from the packs list every sidebar Factory page reads; until one is
 * picked, the frame says why (loading, failed, or no such pack). `pick` sees the list in the
 * server's order (by overview title, else key), so the first is the first by name.
 */
export function PackLookup({
  pick,
  subtitle,
  missing,
  render,
}: {
  pick: (packs: FactoryPackListed[]) => FactoryPackListed | undefined;
  subtitle?: string;
  /** What the frame says once the list is read and `pick` found nothing. */
  missing: string;
  /** Draws the picked pack; `listing` carries the install-wide read problems to show too. */
  render: (pack: FactoryPackListed, listing: FactoryPacksRead) => ReactElement;
}): ReactElement {
  const read = useFactoryPacks();
  const failed = readFailed(read.error);
  const listing = read.data;
  const pack = listing === undefined ? undefined : pick(listing.packs);
  if (listing !== undefined && pack !== undefined) return render(pack, listing);
  return (
    <PackFrame title="Factory" subtitle={subtitle}>
      {failed !== undefined ? (
        <PacksFailed message={factoryErrorDetail(failed)} />
      ) : listing === undefined ? (
        <FactoryLoading read={read}>
          <PackSkeleton />
        </FactoryLoading>
      ) : (
        <>
          <ListingProblems listing={listing} />
          <EmptyNote icon={Factory} sentence={missing} />
        </>
      )}
    </PackFrame>
  );
}

/**
 * A pack page's header: the pack's name as a person reads it, its id on hover. The overview's
 * own title heads How it works (its breadcrumb's root), so the header does not repeat it.
 */
export const packHeading = (pack: FactoryPackListed): { title: string; titleHint: string } => ({
  title: packDisplayName(pack.pack),
  titleHint: pack.pack,
});

import type { ReactElement, ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import { errorDetail } from '../../lib/http';
import { FactoryErrors } from '../FactoryFrame';
import { FactoryLoading } from '../FactoryLoading';
import { OverviewBody } from '../overview/OverviewPage';
import { useFactoryPacks } from '../useFactoryPacks';
import { readFailed } from '../lib/deadline';
import { factoryPath, type FactoryPackListed } from '../lib/views';
import { AllPacksLink, PackFrame, PacksFailed } from './PackFrame';

/**
 * `/console/factory/:pack/how-it-works`: How it works for one pack, from the overview file the
 * server chose (the pack's own, else a project's, named under the title). A pack explains the
 * factory on every project that runs it, so its page lives in the sidebar, not in a project.
 */
export function PackPage(): ReactElement {
  const { pack: packKey = '' } = useParams<{ pack: string }>();
  const read = useFactoryPacks();
  const failed = readFailed(read.error);
  const pack = read.data?.packs.find(listed => listed.key === packKey);
  if (pack === undefined)
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
  return (
    <PackFrame
      title={pack.overview?.declaration.title ?? pack.key}
      subtitle={<ReadFrom pack={pack} />}
      tabs={{ packKey: pack.key, active: 'how-it-works' }}
    >
      <FactoryErrors errors={pack.errors} />
      {pack.overview === null ? null : <OverviewBody overview={pack.overview.declaration} />}
    </PackFrame>
  );
}

/** Which file the page reads, and the project it came from when it is not the pack's own. */
function ReadFrom({ pack }: { pack: FactoryPackListed }): ReactNode {
  if (pack.overview === null) return pack.pack;
  if (pack.readFrom === null) return `${pack.pack}: the pack's own overview file`;
  return (
    <>
      Read from{' '}
      <Link
        to={factoryPath(pack.readFrom.codebaseId)}
        className="text-accent-bright hover:underline"
      >
        {pack.readFrom.name}
      </Link>{' '}
      {/* The file's name; its whole path, in the project's checkout, on hover. */}
      <span className="font-mono" title={pack.overview.path}>
        ({pack.overview.path.split(/[\\/]/).at(-1)})
      </span>
    </>
  );
}

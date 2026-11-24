import type { ReactElement, ReactNode } from 'react';
import { Navigate, useParams } from 'react-router';
import { FactoryErrors } from '../FactoryFrame';
import { OverviewBody } from '../overview/OverviewPage';
import { factoryPackPath, type FactoryPackListed } from '../lib/views';
import { PackFrame } from './PackFrame';
import { PackLookup, packHeading } from './PackLookup';

/**
 * `/console/factory/:pack/how-it-works`: How it works for one pack, from the overview file the
 * server chose (the pack's own, else a project's copy, said behind the header's Source toggle).
 * A pack explains the factory on every project that runs it, so its page lives in the sidebar,
 * not in a project, and names none (owner change of 2026-11-23).
 */
export function PackPage(): ReactElement {
  const { pack: key = '' } = useParams<{ pack: string }>();
  return (
    <PackLookup
      subtitle={key}
      pick={packs => packs.find(listed => listed.key === key)}
      missing={`No installed pack keyed "${key}" has a factory overview file.`}
      render={pack => <HowItWorks pack={pack} />}
    />
  );
}

/**
 * `/console/factory`: there is no pack index (DESIGN.md, v2 direction). It opens How it works
 * of the first listed pack; the server lists them by name, so with several the first by name.
 */
export function FactoryHome(): ReactElement {
  return (
    <PackLookup
      pick={packs => packs[0]}
      missing="No installed pack has a factory overview file."
      render={pack => <Navigate replace to={factoryPackPath(pack.key)} />}
    />
  );
}

function HowItWorks({ pack }: { pack: FactoryPackListed }): ReactElement {
  return (
    <PackFrame {...packHeading(pack)} source={<ReadFrom pack={pack} />}>
      <FactoryErrors errors={pack.errors} />
      {pack.overview === null ? null : <OverviewBody overview={pack.overview.declaration} />}
    </PackFrame>
  );
}

/**
 * Which file the page reads: the pack's own, or a copy in a project's checkout, which the page
 * does not name, since the page is the pack's, not that project's.
 */
function ReadFrom({ pack }: { pack: FactoryPackListed }): ReactNode {
  if (pack.overview === null) return 'No readable overview file';
  if (pack.readFrom === null) return "Read from the pack's own overview file";
  return (
    <>
      Read from a project&apos;s copy of the overview file{' '}
      {/* The file's name; its whole path, in the project's checkout, on hover. */}
      <span className="font-mono" title={pack.overview.path}>
        ({pack.overview.path.split(/[\\/]/).at(-1)})
      </span>
    </>
  );
}

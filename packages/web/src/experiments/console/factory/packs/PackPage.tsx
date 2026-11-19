import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { FactoryErrors } from '../FactoryFrame';
import { OverviewBody } from '../overview/OverviewPage';
import { factoryPath, type FactoryPackListed } from '../lib/views';
import { PackFrame } from './PackFrame';
import { PackLookup, packTitle } from './PackLookup';

/**
 * `/console/factory/:pack/how-it-works`: How it works for one pack, from the overview file the
 * server chose (the pack's own, else a project's, named under the title). A pack explains the
 * factory on every project that runs it, so its page lives in the sidebar, not in a project.
 */
export function PackPage(): ReactElement {
  return <PackLookup render={pack => <HowItWorks pack={pack} />} />;
}

function HowItWorks({ pack }: { pack: FactoryPackListed }): ReactElement {
  return (
    <PackFrame
      title={packTitle(pack)}
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
  if (pack.overview === null) return 'No readable overview file';
  if (pack.readFrom === null) return "Read from the pack's own overview file";
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

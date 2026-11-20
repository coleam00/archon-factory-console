import { useId, useState, type ReactElement, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { TabLink } from '../../components/TabLink';
import { BackLink } from '../BackLink';
import { factoryPackPath } from '../lib/views';

/** A pack page's tabs; each has its route in `routes.tsx`. */
export const PACK_TABS = [
  { key: 'how-it-works', label: 'How it works', rest: '/how-it-works' },
  { key: 'settings', label: 'Settings', rest: '/settings' },
] as const;
export type PackTab = (typeof PACK_TABS)[number]['key'];

/**
 * The frame of the sidebar's Factory pages: a header in the console's shape (the page title,
 * at most one meta line under it, and the tabs), then the page. The header stays about the
 * height of a project's, so How it works keeps its root view in the first screen at 1440x900.
 * Where the page was read from is a detail, not a line of the header: a quiet "Source" toggle
 * beside the title opens it.
 */
export function PackFrame({
  title,
  titleHint,
  subtitle,
  source,
  tabs,
  children,
}: {
  title: ReactNode;
  /** The title's hover text: the raw id a readable title stands for. */
  titleHint?: string;
  subtitle?: ReactNode;
  /** Where the page was read from, behind the Source toggle. */
  source?: ReactNode;
  /** The pack's key and the open tab; none on the index or a page with no pack. */
  tabs?: { packKey: string; active: PackTab };
  children: ReactNode;
}): ReactElement {
  const [sourceOpen, setSourceOpen] = useState(false);
  const sourceId = useId();
  return (
    <section className="flex h-full flex-col">
      <header className="flex flex-col gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <h1
              title={titleHint}
              className="min-w-0 truncate text-console-22 font-semibold tracking-console-heading text-text-primary"
            >
              {title}
            </h1>
            {source === undefined ? null : (
              <button
                type="button"
                aria-expanded={sourceOpen}
                aria-controls={sourceId}
                onClick={() => {
                  setSourceOpen(open => !open);
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded text-console-12 text-text-tertiary transition-colors duration-150 ease-out hover:text-text-secondary"
              >
                <Info aria-hidden="true" className="size-4" />
                Source
              </button>
            )}
          </div>
          {subtitle === undefined ? null : (
            <div className="truncate text-console-13 text-text-tertiary">{subtitle}</div>
          )}
          {source === undefined || !sourceOpen ? null : (
            <p
              id={sourceId}
              className="min-w-0 text-console-13 text-text-tertiary [overflow-wrap:anywhere]"
            >
              {source}
            </p>
          )}
        </div>
        {tabs === undefined ? null : <PackTabs {...tabs} />}
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-6">{children}</div>
      </div>
    </section>
  );
}

function PackTabs({ packKey, active }: { packKey: string; active: PackTab }): ReactElement {
  return (
    <nav aria-label="Pack" className="flex items-center gap-1">
      {PACK_TABS.map(({ key, label, rest }) => (
        <TabLink key={key} to={factoryPackPath(packKey, rest)} active={key === active}>
          {label}
        </TabLink>
      ))}
    </nav>
  );
}

/** What a sidebar Factory page says when the packs could not be read. */
export function PacksFailed({ message }: { message: string }): ReactElement {
  return (
    <p role="alert" className="text-console-14 text-error">
      The factory packs could not be loaded: {message}
    </p>
  );
}

/** The link back to every pack. */
export function AllPacksLink(): ReactElement {
  return <BackLink to="/console/factory" label="All factory packs" />;
}

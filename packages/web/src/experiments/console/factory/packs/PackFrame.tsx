import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { ProjectHeader } from '../../components/ProjectHeader';
import { factoryPackPath } from '../lib/views';

/**
 * A pack page's tabs. The pack's read-only settings are planned as a second tab: that item
 * adds its entry here and its route in `routes.tsx`. Nothing shows for it until then.
 */
export const PACK_TABS = [
  { key: 'how-it-works', label: 'How it works', rest: '/how-it-works' },
] as const;
export type PackTab = (typeof PACK_TABS)[number]['key'];

/**
 * The frame of the sidebar's Factory pages: a header in the console's shape (the title, one
 * line under it, and the tabs), then the page. The header stays the height of a project's,
 * so How it works keeps its root view in the first screen at 1440x900.
 */
export function PackFrame({
  title,
  subtitle,
  tabs,
  children,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  /** The pack's key and the open tab; none on the index or a page with no pack. */
  tabs?: { packKey: string; active: PackTab };
  children: ReactNode;
}): ReactElement {
  return (
    <section className="flex h-full flex-col">
      <ProjectHeader title={title} subtitle={subtitle}>
        {tabs === undefined ? null : <PackTabs {...tabs} />}
      </ProjectHeader>
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
        <Link
          key={key}
          to={factoryPackPath(packKey, rest)}
          aria-current={key === active ? 'page' : undefined}
          className={`rounded px-2 py-1 text-console-12 font-medium transition-colors ${
            key === active
              ? 'bg-surface-elevated text-text-primary'
              : 'text-text-tertiary hover:text-text-primary'
          }`}
        >
          {label}
        </Link>
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
  return (
    <Link to="/console/factory" className="text-console-13 text-accent-bright underline">
      All factory packs
    </Link>
  );
}

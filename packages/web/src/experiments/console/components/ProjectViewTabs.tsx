import type { ReactElement } from 'react';
import { factoryTabShown } from '../factory/lib/views';
import { useFactoryViews } from '../factory/useFactoryViews';
import { needsYouCount } from '../lib/needs-you';
import { useProjectAttention } from './ProjectAttention';
import { TabLink } from './TabLink';

type ProjectView = 'needs-you' | 'runs' | 'chat' | 'metrics' | 'factory';

interface ProjectViewTabsProps {
  projectId: string;
  active: ProjectView;
}

const TABS: readonly { key: ProjectView; label: string; suffix: string }[] = [
  { key: 'needs-you', label: 'Needs you', suffix: '/needs-you' },
  { key: 'runs', label: 'Runs', suffix: '' },
  { key: 'chat', label: 'Chat', suffix: '/chat' },
  { key: 'metrics', label: 'Metrics', suffix: '/metrics' },
];
const FACTORY_TAB = { key: 'factory', label: 'Factory', suffix: '/factory' } as const;

/**
 * Needs you | Runs | Chat | Metrics tab control under a project, then Factory when a factory
 * view applies to the project. Needs you carries how many asks and waits need a person, in the
 * needs-you colour, while above zero. Each tab is a `TabLink` (brand-bar underline on the
 * active one). Only meaningful when a project is scoped, so it is rendered only under
 * `ProjectAttentionLayout`, never on the All-projects view.
 */
export function ProjectViewTabs({ projectId, active }: ProjectViewTabsProps): ReactElement {
  const { data: factoryViews } = useFactoryViews(projectId);
  const attention = useProjectAttention();
  const waiting = attention.data === undefined ? 0 : needsYouCount(attention.data);
  const tabs = factoryTabShown(factoryViews) ? [...TABS, FACTORY_TAB] : TABS;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tabs.map(({ key, label, suffix }) => (
        <TabLink key={key} to={`/console/p/${projectId}${suffix}`} active={key === active}>
          {label}
          {key === 'needs-you' && waiting > 0 ? <WaitingBadge count={waiting} /> : null}
        </TabLink>
      ))}
    </div>
  );
}

/**
 * How many wait on a person, in the needs-you colour. A chip that counts needs-you stays soft
 * (Visual standard, rule 5): the filled pill is a card's own Needs you state.
 */
export function WaitingBadge({ count }: { count: number }): ReactElement {
  return (
    <span
      aria-label={`${count.toString()} waiting`}
      className="rounded-full bg-[color:var(--warning-soft)] px-1.5 text-console-12 font-semibold normal-case tabular-nums tracking-normal text-warning"
    >
      {count}
    </span>
  );
}

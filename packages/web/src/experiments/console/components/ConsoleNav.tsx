import type { ReactElement } from 'react';
import { ChartLine, PenTool, Settings } from 'lucide-react';
import { FactoryRailLink } from '../factory/FactoryRailLink';
import { RailNavLink } from './RailNavLink';

/** The rail's console navigation under the projects: the pages that span every project. */
export function ConsoleNav(): ReactElement {
  return (
    <nav aria-label="Console" className="flex flex-col gap-0.5 border-t border-border px-2.5 py-2">
      <RailNavLink to="/console/metrics" icon={ChartLine} label="Metrics" />
      <RailNavLink
        to="/console/builder"
        icon={PenTool}
        label="Workflow Builder"
        title="Visual workflow builder (beta)"
        badge="beta"
      />
      <FactoryRailLink />
      <RailNavLink to="/console/settings" icon={Settings} label="Settings" title="Settings ( , )" />
    </nav>
  );
}

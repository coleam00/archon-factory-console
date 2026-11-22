import type { ReactElement, ReactNode } from 'react';
import { useLocation } from 'react-router';
import type { FactoryPackSettings } from '../../skills/factory';
import { TabLink } from '../../components/TabLink';
import { HeaderBand, StatChip } from '../document';
import { settingCounts } from '../lib/setting-sections';

type ProjectSettings = FactoryPackSettings['projects'][number];

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/**
 * The Settings page's header band (owner change 6 of 2026-11-21): how the project in focus has
 * set up its factory, counted; with no project, how the pack is set up. With several projects,
 * a link to each.
 */
export function SettingsHeader({
  settings,
  packName,
  project,
}: {
  settings: FactoryPackSettings;
  packName: string;
  project: ProjectSettings | undefined;
}): ReactElement {
  const counts = settingCounts(settings.settings, project);
  const chips: ReactNode[] = [
    <StatChip
      key="total"
      figure={counts.total}
      label={plural(counts.total, 'setting', 'settings')}
    />,
  ];
  if (counts.set !== null && counts.packDefault !== null)
    chips.push(
      <StatChip key="set" figure={counts.set} label="set by this project" />,
      <StatChip
        key="default"
        figure={counts.packDefault}
        label={plural(counts.packDefault, 'pack default', 'pack defaults')}
      />
    );
  chips.push(
    <StatChip
      key="shadows"
      figure={counts.shadows}
      label={`${plural(counts.shadows, 'shadow', 'shadows')} today`}
      state="shadow"
    />
  );
  return (
    <HeaderBand
      title={
        project === undefined
          ? `How ${packName} is set up`
          : `How ${project.name} has set up its factory`
      }
      sentence={
        project === undefined
          ? `Every setting of ${packName}, grouped by what it governs, with the pack's defaults.`
          : `Every setting of ${packName}, grouped by what it governs: what ${project.name} sets, and where it falls back to the pack.`
      }
      chips={chips}
      aside={
        settings.projects.length > 1 ? (
          <ProjectSwitch projects={settings.projects} focus={project} />
        ) : undefined
      }
    />
  );
}

/** One link per project that runs the pack, the one in focus active; the query keeps the page. */
export function ProjectSwitch({
  projects,
  focus,
}: {
  projects: readonly ProjectSettings[];
  focus: ProjectSettings | undefined;
}): ReactElement {
  const { pathname } = useLocation();
  const sorted = [...projects].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <nav aria-label="Project" className="flex flex-wrap items-center gap-1">
      {sorted.map(project => (
        <TabLink
          key={project.codebaseId}
          to={`${pathname}?project=${encodeURIComponent(project.codebaseId)}`}
          active={project.codebaseId === focus?.codebaseId}
        >
          {project.name}
        </TabLink>
      ))}
    </nav>
  );
}

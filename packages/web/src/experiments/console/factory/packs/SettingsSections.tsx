import { type ReactElement, useId } from 'react';
import { SlidersHorizontal, type LucideIcon } from 'lucide-react';
import type { FactoryPackSettings } from '../../skills/factory';
import { SectionHeading, type ToneColor } from '../document';
import { groupSettings, type SettingGroup } from '../lib/setting-sections';
import { ICONS, KINDS } from '../overview/overview-kinds';
import { SettingPanel } from './SettingPanel';

type ProjectSettings = FactoryPackSettings['projects'][number];

/**
 * The settings by what they govern (owner change 6 of 2026-11-21), in the sections the overview
 * file's map names, each in its kind's colour and icon; "Other" last, neutral, for any setting
 * the map puts in none.
 */
export function SettingsSections({
  settings,
  project,
}: {
  settings: FactoryPackSettings;
  project: ProjectSettings | undefined;
}): ReactElement[] {
  return groupSettings(settings.settings, settings.sections).map(group => (
    <SettingsSection key={group.id} group={group} project={project} />
  ));
}

const OTHER = {
  eyebrow: 'Other',
  title: 'Other settings',
  tone: 'var(--node-opaque)',
  icon: SlidersHorizontal,
} as const satisfies { eyebrow: string; title: string; tone: ToneColor; icon: LucideIcon };

function SettingsSection({
  group,
  project,
}: {
  group: SettingGroup;
  project: ProjectSettings | undefined;
}): ReactElement {
  const headingId = useId();
  const look =
    group.section === null
      ? OTHER
      : {
          eyebrow: group.section.eyebrow,
          title: group.section.title,
          tone: KINDS[group.section.kind].color,
          icon: ICONS[group.section.icon],
        };
  return (
    <section
      data-doc-section=""
      data-section={group.id}
      aria-labelledby={headingId}
      className="flex flex-col gap-3"
    >
      <SectionHeading id={headingId} {...look} count={group.settings.length} />
      {/* console-token-exception min-[1800px]:grid-cols-3 -- owner change 6 of 2026-11-21: setting panels go three across from about 1800 px. */}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 min-[1800px]:grid-cols-3">
        {group.settings.map(setting => (
          <SettingPanel key={setting.name} setting={setting} project={project} tone={look.tone} />
        ))}
      </ul>
    </section>
  );
}

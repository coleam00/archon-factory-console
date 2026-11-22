import type { ReactElement, ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { errorDetail } from '../../lib/http';
import type { FactoryPackSettings } from '../../skills/factory';
import { SkeletonBlock, SkeletonGroup, SkeletonInnerLine } from '../../components/Skeleton';
import { FactoryLoading } from '../FactoryLoading';
import { readFailed } from '../lib/deadline';
import { packDisplayName } from '../lib/pack-name';
import { projectInFocus } from '../lib/setting-sections';
import type { FactoryPackListed } from '../lib/views';
import { useFactoryPackSettings } from '../useFactoryPackSettings';
import { PackFrame } from './PackFrame';
import { PackLookup, packHeading } from './PackLookup';
import { SettingsHeader } from './SettingsHeader';
import { SettingsSections } from './SettingsSections';
import { NoSettings, SettingsErrors, Undeclared, UnknownProject } from './SettingsNotices';

/**
 * `/console/factory/:pack/settings`: how a project has set up the pack, read-only, as a document
 * page (DESIGN.md, owner changes 5 and 6 of 2026-11-21). A header band counts the settings,
 * then each section the overview file's map names holds a panel per setting, with what the
 * project in focus (`?project=`, else the first by name) sets. Everything comes from the
 * pack's declaration, the overview's map and the projects' files; nothing here names a setting.
 */
export function PackSettingsPage(): ReactElement {
  return <PackLookup render={pack => <PackSettings pack={pack} />} />;
}

function PackSettings({ pack }: { pack: FactoryPackListed }): ReactElement {
  const read = useFactoryPackSettings(pack.key);
  const failed = readFailed(read.error);
  const data = read.data;
  return (
    <PackFrame
      {...packHeading(pack)}
      source={data === undefined ? undefined : <ReadFrom settings={data} />}
      tabs={{ packKey: pack.key, active: 'settings' }}
    >
      {data !== undefined ? (
        <SettingsBody settings={data} packName={packDisplayName(pack.pack)} />
      ) : failed !== undefined ? (
        <p role="alert" className="text-console-14 text-error">
          The pack&apos;s settings could not be read: {errorDetail(failed)}
        </p>
      ) : (
        <SettingsSkeleton read={read} />
      )}
    </PackFrame>
  );
}

/** Where the page reads: the pack's declaration (its path on hover) and each project's file. */
function ReadFrom({ settings }: { settings: FactoryPackSettings }): ReactNode {
  return (
    <>
      Read from <span title={settings.declaration?.path}>the pack&apos;s declaration</span> and each
      project&apos;s <span className="font-mono">{settings.settingsFile}</span>
    </>
  );
}

function SettingsBody({
  settings,
  packName,
}: {
  settings: FactoryPackSettings;
  packName: string;
}): ReactElement {
  const [search] = useSearchParams();
  const { project, unknown } = projectInFocus(settings.projects, search.get('project'));
  return (
    <div data-doc-page="" className="flex flex-col gap-6">
      <SettingsHeader settings={settings} packName={packName} project={project} />
      {unknown === null ? null : <UnknownProject id={unknown} projects={settings.projects} />}
      <SettingsErrors settings={settings} />
      <SettingsSections settings={settings} project={project} />
      <Undeclared projects={settings.projects} focus={project} />
      {settings.settings.length === 0 && !settings.declaration?.error ? <NoSettings /> : null}
    </div>
  );
}

/** Rule 6: the band's and four setting panels' shapes, two across, while the settings are read. */
function SettingsSkeleton({
  read,
}: {
  read: ReturnType<typeof useFactoryPackSettings>;
}): ReactElement {
  return (
    <FactoryLoading read={read}>
      <SkeletonGroup label="Reading the pack's settings" className="flex flex-col gap-6">
        <SkeletonBlock height="h-32">
          <SkeletonInnerLine width="short" />
          <SkeletonInnerLine />
        </SkeletonBlock>
        {/* console-token-exception min-[112.5rem]:grid-cols-3 -- owner change 6 of 2026-11-21: setting panels go three across from about 1800 px (112.5rem; in rem so it sorts after md:, which a px value does not). */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 min-[112.5rem]:grid-cols-3">
          {['a', 'b', 'c', 'd'].map(key => (
            <SkeletonBlock key={key} height="h-40">
              <SkeletonInnerLine width="short" />
              <SkeletonInnerLine />
              <SkeletonInnerLine width="short" />
            </SkeletonBlock>
          ))}
        </div>
      </SkeletonGroup>
    </FactoryLoading>
  );
}

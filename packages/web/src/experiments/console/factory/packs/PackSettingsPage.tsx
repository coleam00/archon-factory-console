import type { ReactElement, ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { errorDetail } from '../../lib/http';
import type { FactoryPackSettings } from '../../skills/factory';
import { FactoryLoading } from '../FactoryLoading';
import { readFailed } from '../lib/deadline';
import type { FactoryPackListed } from '../lib/views';
import { useFactoryPackSettings } from '../useFactoryPackSettings';
import { PackFrame } from './PackFrame';
import { PackLookup, packTitle } from './PackLookup';
import { SettingCard, UndeclaredCard } from './SettingCard';

/**
 * `/console/factory/:pack/settings`: how a pack is configured, read-only. One card per
 * setting the pack declares, in its order, with what each project that runs the pack sets.
 * Everything comes from the pack's declaration and the projects' files; nothing here names a
 * setting.
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
      title={packTitle(pack)}
      subtitle={data === undefined ? "The pack's settings" : <ReadFrom settings={data} />}
      tabs={{ packKey: pack.key, active: 'settings' }}
    >
      {data !== undefined ? (
        <SettingsBody settings={data} />
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

function SettingsBody({ settings }: { settings: FactoryPackSettings }): ReactElement {
  return (
    <>
      <SettingsErrors settings={settings} />
      {settings.settings.length === 0 ? (
        settings.declaration?.error ? null : (
          <NoSettings />
        )
      ) : (
        <ul className="flex max-w-5xl flex-col gap-3">
          {settings.settings.map(setting => (
            <SettingCard key={setting.name} setting={setting} projects={settings.projects} />
          ))}
        </ul>
      )}
      <UndeclaredCard projects={settings.projects} />
    </>
  );
}

/** The declaration that could not be read, and overview map keys the pack does not declare. */
function SettingsErrors({ settings }: { settings: FactoryPackSettings }): ReactNode {
  const declaration = settings.declaration?.error
    ? [{ key: 'declaration', path: settings.declaration.path, text: settings.declaration.error }]
    : [];
  const map = settings.mapErrors.map(text => ({ key: text, path: null, text }));
  const errors = [...declaration, ...map];
  if (errors.length === 0) return null;
  return (
    <div
      role="alert"
      className="flex max-w-5xl flex-col gap-2 rounded-console-12 border border-error/30 bg-error/10 px-4 py-3"
    >
      <p className="text-console-13 font-medium text-error">
        {declaration.length > 0
          ? "The pack's declaration could not be read"
          : 'The factory overview presents a setting the pack does not declare'}
      </p>
      <ul className="flex flex-col gap-1">
        {errors.map(error => (
          <li key={error.key} className="text-console-13 text-text-secondary">
            {error.path === null ? null : (
              <span className="block break-all font-mono text-text-primary">{error.path}</span>
            )}
            <span className="block break-words">{error.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NoSettings(): ReactElement {
  return (
    <div className="flex flex-col items-start gap-2">
      <SlidersHorizontal aria-hidden className="size-5 text-text-tertiary" />
      <p className="text-console-14 text-text-secondary">
        This pack declares no settings: a project has nothing to set for it.
      </p>
    </div>
  );
}

/** Rule 6: three setting cards' shapes while the settings are read. */
function SettingsSkeleton({ read }: { read: ReturnType<typeof useFactoryPackSettings> }) {
  return (
    <ul className="flex max-w-5xl flex-col gap-3">
      {['a', 'b', 'c'].map(key => (
        <li
          key={key}
          aria-hidden
          className="flex h-40 flex-col gap-2 rounded-console-12 border border-border bg-surface p-4"
        >
          <span className="h-3 w-2/5 rounded bg-surface-elevated motion-safe:animate-pulse" />
          <span className="h-3 w-3/5 rounded bg-surface-elevated motion-safe:animate-pulse" />
          <span className="h-3 w-2/5 rounded bg-surface-elevated motion-safe:animate-pulse" />
        </li>
      ))}
      <li className="sr-only">
        <FactoryLoading read={read} label="Reading the pack's settings" />
      </li>
    </ul>
  );
}

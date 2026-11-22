import type { ReactElement } from 'react';
import type { FactoryPackSettings } from '../../skills/factory';
import { ClampedSummary } from '../ClampedSummary';
import { IdTag, Panel, type ToneColor } from '../document';
import { ShadowBadge } from '../ShadowBadge';
import { settingLabel } from '../lib/setting-name';
import { SettingValue } from './SettingValue';

type Setting = FactoryPackSettings['settings'][number];
type ProjectSettings = FactoryPackSettings['projects'][number];

/**
 * One setting as a compact panel (owner change 6 of 2026-11-21): its plain name with the id
 * beside it, one line of what it does, what the project in focus sets as the most prominent
 * thing, and the pack's default as meta. Its bar is the section's colour, or `--node-opaque` on
 * a shadow (Visual standard, rule 10), which also says what would change once it is live.
 */
export function SettingPanel({
  setting,
  project,
  tone,
}: {
  setting: Setting;
  project: ProjectSettings | undefined;
  tone: ToneColor;
}): ReactElement {
  return (
    <Panel
      as="li"
      data-setting={setting.name}
      tone={setting.shadow ? 'var(--node-opaque)' : tone}
      bar="left"
      className="flex flex-col gap-3 py-4 pr-4 pl-5"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-console-15 font-semibold text-text-primary">
          {settingLabel(setting.name)}
        </h3>
        <IdTag id={setting.name} />
        {setting.shadow ? <ShadowBadge className="ml-auto" /> : null}
      </div>
      {setting.description === null ? null : (
        <ClampedSummary text={setting.description} lines={1} />
      )}
      <div data-setting-value="">
        <SettingValue setting={setting} project={project} />
      </div>
      {setting.shadow && setting.whenLive !== null ? (
        <p className="text-console-13 text-text-tertiary">{setting.whenLive}</p>
      ) : null}
      {project === undefined ? null : (
        <p className="text-console-12 text-text-tertiary [overflow-wrap:anywhere]">
          Pack default:{' '}
          <span className="font-mono">
            {setting.default === null || setting.default === '' ? 'none' : setting.default}
          </span>
        </p>
      )}
    </Panel>
  );
}

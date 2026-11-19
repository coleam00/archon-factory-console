import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import type { FactoryPackSettings } from '../../skills/factory';
import { ClampedSummary } from '../ClampedSummary';
import { ShadowBadge } from '../ShadowBadge';
import { settingLabel } from '../lib/setting-name';
import { factoryPath } from '../lib/views';

type Setting = FactoryPackSettings['settings'][number];
type ProjectSettings = FactoryPackSettings['projects'][number];
type Value = ProjectSettings['values'][string];
type SettingFile = NonNullable<Extract<Value, { state: 'set' }>['file']>;

/**
 * One declared setting (rule 2's drill-down card, without a group's accent bar: a setting is
 * not a stage): its plain name and key, the pack's description, its default, and what each
 * project sets.
 */
export function SettingCard({
  setting,
  projects,
}: {
  setting: Setting;
  projects: readonly ProjectSettings[];
}): ReactElement {
  return (
    <li
      data-setting={setting.name}
      className="flex flex-col gap-2 rounded-console-12 border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="text-console-15 font-semibold text-text-primary">
          {settingLabel(setting.name)}
        </h2>
        <span className="font-mono text-console-13 text-text-tertiary">{setting.name}</span>
        {setting.shadow ? <ShadowBadge /> : null}
      </div>
      {setting.description === null ? null : (
        <ClampedSummary text={setting.description} lines={3} />
      )}
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-console-12 font-medium uppercase tracking-console-label text-text-tertiary">
          Default
        </span>
        <span className="font-mono text-console-13 text-text-secondary">
          {setting.default === null ? 'none' : setting.default === '' ? 'empty' : setting.default}
        </span>
      </div>
      {projects.length === 0 ? null : (
        <dl className="flex flex-col gap-2 border-t border-border pt-2">
          {projects.map(project => (
            <ProjectRow key={project.codebaseId} project={project}>
              <ProjectValue project={project} setting={setting} />
            </ProjectRow>
          ))}
        </dl>
      )}
    </li>
  );
}

/** A project's name, linked to its Factory tab, then what it sets: side by side, stacked on a phone. */
function ProjectRow({ project, children }: { project: ProjectSettings; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
      <dt className="shrink-0 break-words text-console-13 text-text-tertiary sm:w-64">
        <Link to={factoryPath(project.codebaseId)} className="hover:text-text-primary">
          {project.name}
        </Link>
      </dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

function ProjectValue({
  project,
  setting,
}: {
  project: ProjectSettings;
  setting: Setting;
}): ReactNode {
  if (project.error !== null)
    return (
      <span className="break-words text-console-13 text-error">
        Its settings file could not be read: {project.error}
      </span>
    );
  const value = project.values[setting.name];
  // The server gives every declared setting a value; a missing one reads as unset.
  if (value === undefined || value.state !== 'set')
    return <span className="text-console-14 text-text-tertiary">pack default</span>;
  return (
    <div className="flex flex-col gap-1">
      {value.file === null ? (
        <span className="break-all font-mono text-console-14 text-text-secondary">
          {value.value}
        </span>
      ) : (
        <FileValue file={value.file} />
      )}
      {value.problem === null ? null : (
        <span className="text-console-13 text-error">
          A run refuses this value: {value.problem}
        </span>
      )}
    </div>
  );
}

/** A policy or checks file: its path (whole on hover), whether it is there, and its checks. */
function FileValue({ file }: { file: SettingFile }): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span title={file.full} className="break-all font-mono text-console-14 text-text-secondary">
          {file.display}
        </span>
        {file.status === 'missing' ? (
          <span className="text-console-13 text-error">file not found</span>
        ) : file.status === 'unreadable' ? (
          <span className="text-console-13 text-error">could not be read: {file.error}</span>
        ) : null}
      </div>
      {file.checks === null ? null : (
        <ul aria-label="Checks" className="flex flex-col gap-1">
          {file.checks.map(check => (
            <li key={check.name} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-console-13 font-medium text-text-primary">
                {check.name}
              </span>
              <span className="break-all font-mono text-console-13 text-text-tertiary">
                {check.run}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Keys a project's file sets that the pack does not declare; absent when there are none. */
export function UndeclaredCard({ projects }: { projects: readonly ProjectSettings[] }): ReactNode {
  const rows = projects.flatMap(project =>
    project.undeclared.map(setting => ({ project, ...setting }))
  );
  if (rows.length === 0) return null;
  return (
    <section
      aria-label="Not declared by the pack"
      className="flex max-w-5xl flex-col gap-2 rounded-console-12 border border-border bg-surface p-4"
    >
      <h2 className="text-console-15 font-semibold text-text-primary">Not declared by the pack</h2>
      <p className="text-console-13 text-text-tertiary">
        A project&apos;s settings file sets these, and the pack declares no such setting. A run of
        the pack refuses the file while it does.
      </p>
      <dl className="flex flex-col gap-2 border-t border-border pt-2">
        {rows.map(row => (
          <ProjectRow key={`${row.project.codebaseId}:${row.name}`} project={row.project}>
            <span className="flex flex-wrap items-baseline gap-x-2 font-mono text-console-14">
              <span className="text-text-primary">{row.name}</span>
              <span className="break-all text-text-secondary">{row.value}</span>
            </span>
          </ProjectRow>
        ))}
      </dl>
    </section>
  );
}

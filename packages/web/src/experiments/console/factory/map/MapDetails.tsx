import type { ReactElement } from 'react';
import { Link } from 'react-router';
import type { FactoryItem } from '../../skills/factory';
import type { FactoryStage } from '../lib/stage-steps';
import type { StageLive } from '../lib/map-live';
import { factoryPath } from '../lib/views';

interface MapDetailsProps {
  projectId: string;
  stage: FactoryStage;
  live: StageLive;
  onClose: () => void;
}

const HEADING = 'text-console-11 font-medium uppercase tracking-wider text-text-tertiary';

/** A selected card's details beside the map: what the stage does, what is in it, what runs it. */
export function MapDetails({ projectId, stage, live, onClose }: MapDetailsProps): ReactElement {
  const stagePath = factoryPath(projectId, `/stages/${encodeURIComponent(stage.id)}`);
  const waiting = new Set(live.needYou.map(item => item.item.id));
  return (
    <aside
      aria-label={`${stage.label} details`}
      className="relative shrink-0 rounded-console-12 border border-border bg-surface md:w-80"
    >
      {/* Beside the map the panel scrolls within the map's height rather than stretching it. */}
      <div className="flex flex-col gap-3 px-4 py-3 md:absolute md:inset-0 md:overflow-y-auto">
        <div className="flex items-baseline gap-2">
          <h4 className="text-sm font-medium text-text-primary">{stage.label}</h4>
          <Link to={stagePath} className="text-console-12 text-accent-bright underline">
            Open stage
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="ml-auto rounded px-1 text-console-12 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          >
            ✕
          </button>
        </div>
        <p className="text-console-12 leading-relaxed text-text-secondary">{stage.blurb}</p>
        <section className="flex flex-col gap-1.5">
          <h5 className={HEADING}>Items here · {live.items.length}</h5>
          {live.items.length === 0 ? (
            <p className="text-console-12 text-text-tertiary">Nothing here now.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {live.items.map(item => (
                <ItemRow
                  key={item.item.id}
                  projectId={projectId}
                  item={item}
                  needsYou={waiting.has(item.item.id)}
                />
              ))}
            </ul>
          )}
        </section>
        <section className="flex flex-col gap-1.5">
          <h5 className={HEADING}>Workflows</h5>
          {stage.workflows.length === 0 ? (
            <p className="text-console-12 text-text-tertiary">No workflow runs here.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {stage.workflows.map(workflow => (
                <li key={workflow}>
                  <Link
                    to={stagePath}
                    className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-console-11 text-text-primary hover:bg-surface-hover"
                  >
                    {workflow}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}

function ItemRow({
  projectId,
  item,
  needsYou,
}: {
  projectId: string;
  item: FactoryItem;
  needsYou: boolean;
}): ReactElement {
  const running = item.progress?.running ?? null;
  return (
    <li>
      <Link
        to={factoryPath(projectId, `/items/${encodeURIComponent(item.item.key)}`)}
        className="flex flex-col rounded px-1.5 py-1 hover:bg-surface-hover"
      >
        <span className="flex items-baseline gap-1.5">
          <span className="shrink-0 font-mono text-console-11 text-text-tertiary">
            {item.item.key}
          </span>
          <span className="truncate text-console-12 text-text-primary">
            {item.progress?.title ?? item.item.key}
          </span>
          {needsYou ? (
            <span className="ml-auto shrink-0 rounded-full bg-warning/20 px-1.5 text-console-11 font-semibold text-warning">
              Needs you
            </span>
          ) : null}
        </span>
        {running === null ? null : (
          <span className="truncate font-mono text-console-11 text-[color:var(--running)]">
            {running.workflow} · {running.step ?? 'between steps'}
          </span>
        )}
      </Link>
    </li>
  );
}

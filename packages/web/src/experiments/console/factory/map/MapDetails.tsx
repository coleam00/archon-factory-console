import type { ReactElement } from 'react';
import { Link } from 'react-router';
import { SkeletonGroup, SkeletonLine } from '../../components/Skeleton';
import type { FactoryItem } from '../../skills/factory';
import type { FactoryStage } from '../lib/stage-steps';
import type { StageRead } from '../lib/map-live';
import { SHADOW_MEANS } from '../lib/shadows';
import { runLine } from '../lib/step-label';
import { ShadowBadge } from '../ShadowBadge';
import { factoryPath, type FactoryViewListed } from '../lib/views';

type Declaration = FactoryViewListed['declaration'];

interface StageDetails {
  stage: FactoryStage;
  /** Why there are no items yet, until they are read. */
  live: StageRead;
  /** Notes the declaration places by the stage. */
  notes: readonly string[];
  /** Its shadow steps with what each decided lately (`stageShadowLines`); empty when none. */
  shadows: readonly string[];
}

interface MapDetailsProps {
  projectId: string;
  view: Declaration;
  /** The card's label. */
  title: string;
  /** Its stages, in the card's order. */
  stages: readonly StageDetails[];
  onClose: () => void;
}

const HEADING = 'text-console-12 font-medium uppercase tracking-console-label text-text-tertiary';

/**
 * A card's details beside the map, opened by its details button: for each of its stages, what
 * it does, what is in it, what runs it.
 */
export function MapDetails({
  projectId,
  view,
  title,
  stages,
  onClose,
}: MapDetailsProps): ReactElement {
  return (
    <aside
      aria-label={`${title} details`}
      className="relative shrink-0 rounded-console-12 border border-border bg-surface md:w-80"
    >
      {/* Beside the map the panel scrolls within the map's height rather than stretching it. */}
      <div className="flex flex-col gap-4 px-4 py-3 md:absolute md:inset-0 md:overflow-y-auto">
        <div className="flex items-baseline gap-2">
          <h4 className="text-console-15 font-semibold text-text-primary">{title}</h4>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="ml-auto rounded px-1 text-console-12 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
          >
            ✕
          </button>
        </div>
        {stages.map(entry => (
          <StageSection
            key={entry.stage.id}
            projectId={projectId}
            view={view}
            entry={entry}
            named={stages.length > 1}
          />
        ))}
      </div>
    </aside>
  );
}

/** One stage of the card: its label when the card has several, its blurb, items, workflows. */
function StageSection({
  projectId,
  view,
  entry,
  named,
}: {
  projectId: string;
  view: Declaration;
  entry: StageDetails;
  named: boolean;
}): ReactElement {
  const { stage, live, notes, shadows } = entry;
  const stagePath = factoryPath(projectId, `/stages/${encodeURIComponent(stage.id)}`);
  return (
    <section aria-label={stage.label} className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        {named ? (
          <h5 className="text-console-14 font-medium text-text-primary">{stage.label}</h5>
        ) : null}
        <Link to={stagePath} className="text-console-13 text-accent-bright hover:underline">
          Open stage
        </Link>
      </div>
      <p className="text-console-13 leading-relaxed text-text-secondary">{stage.blurb}</p>
      {notes.map(note => (
        <p key={note} className="text-console-13 italic text-text-tertiary">
          {note}
        </p>
      ))}
      <ShadowSteps lines={shadows} />
      <ItemsHere projectId={projectId} view={view} stage={stage} live={live} />
      <section className="flex flex-col gap-1.5">
        <h6 className={HEADING}>Workflows</h6>
        {stage.workflows.length === 0 ? (
          <p className="text-console-13 text-text-tertiary">No workflow runs here.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {stage.workflows.map(workflow => (
              <li key={workflow}>
                <Link
                  to={stagePath}
                  className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-console-12 text-text-primary hover:bg-surface-hover"
                >
                  {workflow}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

/** The stage's shadow steps (rule 10): each step's label and what it decided lately. */
function ShadowSteps({ lines }: { lines: readonly string[] }): ReactElement | null {
  if (lines.length === 0) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <h6 className={`${HEADING} flex items-center gap-2`}>
        Shadow steps <ShadowBadge className="normal-case tracking-normal" />
      </h6>
      <p className="text-console-13 text-text-tertiary">{`Each ${SHADOW_MEANS}.`}</p>
      <ul className="flex flex-col gap-1">
        {lines.map(line => (
          <li key={line} className="text-console-13 text-text-tertiary">
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * What sits in the stage now; skeleton lines until the items are read (rule 6), never
 * "Nothing here now." early,
 * and "Could not be read." once the first read failed (the alert above the map says why).
 */
function ItemsHere({
  projectId,
  view,
  stage,
  live,
}: {
  projectId: string;
  view: Declaration;
  stage: FactoryStage;
  live: StageRead;
}): ReactElement {
  if (typeof live === 'string')
    return (
      <section className="flex flex-col gap-1.5">
        <h6 className={HEADING}>Items here</h6>
        {live === 'loading' ? (
          <SkeletonGroup label="Loading the items here" className="flex flex-col gap-2">
            <SkeletonLine />
            <SkeletonLine width="short" />
          </SkeletonGroup>
        ) : (
          <p className="text-console-13 text-text-tertiary">Could not be read.</p>
        )}
      </section>
    );
  const waiting = new Set(live.needYou.map(item => item.item.id));
  return (
    <section className="flex flex-col gap-1.5">
      <h6 className={HEADING}>Items here · {live.pending ? 'checking…' : live.items.length}</h6>
      {live.items.length === 0 ? (
        <p className="text-console-13 text-text-tertiary">Nothing here now.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {live.items.map(item => (
            <ItemRow
              key={item.item.id}
              projectId={projectId}
              view={view}
              stage={stage}
              item={item}
              needsYou={waiting.has(item.item.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ItemRow({
  projectId,
  view,
  stage,
  item,
  needsYou,
}: {
  projectId: string;
  view: Declaration;
  /** The stage the item is placed in, which its run line names on a step no stage names. */
  stage: FactoryStage;
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
          <span className="shrink-0 font-mono text-console-12 text-text-tertiary">
            {item.item.key}
          </span>
          <span className="truncate text-console-12 text-text-primary">
            {item.progress?.title ?? item.item.key}
          </span>
          {needsYou ? (
            <span className="ml-auto shrink-0 rounded-full bg-[color:var(--warning-soft)] px-2 text-console-12 font-semibold text-warning">
              Needs you
            </span>
          ) : null}
        </span>
        {running === null ? null : (
          <span
            className="truncate text-console-12 text-[color:var(--running)]"
            title={running.step ?? undefined}
          >
            {runLine(view, running, item.progress?.round, stage).text}
          </span>
        )}
      </Link>
    </li>
  );
}

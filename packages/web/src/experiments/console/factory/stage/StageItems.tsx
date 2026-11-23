import type { ReactElement, ReactNode } from 'react';
import { displayItemKey } from '../lib/item-key';
import { Link } from 'react-router';
import { SkeletonGroup, SkeletonLine } from '../../components/Skeleton';
import type { FactoryItem } from '../../skills/factory';
import type { StageRead } from '../lib/map-live';
import type { FactoryStage } from '../lib/stage-steps';
import { itemPill, PILL_LABEL, type Pill } from '../lib/board';
import { runLine } from '../lib/step-label';
import { factoryPath, type FactoryViewListed } from '../lib/views';

type Declaration = FactoryViewListed['declaration'];

const HEADING = 'text-console-12 font-medium uppercase tracking-console-label text-text-tertiary';

/**
 * What sits in a stage now, each item linking to its page: the map's details panel and the
 * stage's "Items here now" both draw it from the one `StageRead` the map's chips draw from, so
 * the two never disagree. Every item says when it needs you and what run works it; with
 * `resting`, one that neither holds says its state too (merged, failed, waiting), which the
 * details panel leaves out, as every item on the Merged card would repeat it. Skeleton lines
 * until the items are read (rule 6), never `empty` early, and "Could not be read." once the
 * first read failed: what holds it says why, with a Retry (the alert above the map, the notice
 * above a stage's tabs).
 */
export function ItemsHere({
  projectId,
  view,
  stage,
  live,
  empty,
  resting,
}: {
  projectId: string;
  view: Declaration;
  stage: FactoryStage;
  live: StageRead;
  /** What it says when nothing is in the stage. */
  empty: ReactNode;
  /** Whether an item no run works and no ask holds says its state. */
  resting: boolean;
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
        empty
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
              resting={resting}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** One item: its key and title, then its state: needs you, the run working it, or at rest. */
function ItemRow({
  projectId,
  view,
  stage,
  item,
  needsYou,
  resting,
}: {
  projectId: string;
  view: Declaration;
  /** The stage the item is placed in, which its run line names on a step no stage names. */
  stage: FactoryStage;
  item: FactoryItem;
  needsYou: boolean;
  resting: boolean;
}): ReactElement {
  const running = item.progress?.running ?? null;
  return (
    <li>
      <Link
        to={factoryPath(projectId, `/items/${encodeURIComponent(item.item.key)}`)}
        className="flex min-w-0 flex-col rounded px-1.5 py-1 hover:bg-surface-hover"
      >
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 font-mono text-console-12 text-text-tertiary">
            {displayItemKey(item.item.key)}
          </span>
          <span className="min-w-0 truncate text-console-12 text-text-primary">
            {item.progress?.title ?? displayItemKey(item.item.key)}
          </span>
          {needsYou ? (
            <span className="ml-auto shrink-0 rounded-full bg-[color:var(--warning-soft)] px-2 text-console-12 font-semibold text-warning">
              Needs you
            </span>
          ) : null}
        </span>
        {running !== null ? (
          <span
            className="truncate text-console-12 text-[color:var(--running)]"
            title={running.step ?? undefined}
          >
            {runLine(view, running, item.progress?.round, stage).text}
          </span>
        ) : needsYou || !resting ? null : (
          <RestingState view={view} stage={stage} item={item} />
        )}
      </Link>
    </li>
  );
}

/**
 * The state of an item no run works and no ask holds, in the board card's words
 * (`itemPill`): merged, failed, parked, or waiting. Whether it needs you is the attention queue's to
 * say, as on the map's chip: an ask only the item's own read lists reads as waiting here.
 */
function RestingState({
  view,
  stage,
  item,
}: {
  view: Declaration;
  stage: FactoryStage;
  item: FactoryItem;
}): ReactElement {
  const pill = rested(itemPill(view, item, stage.id === view.landed.stage, stage.label).pill);
  const tone =
    pill === 'failed'
      ? 'text-error'
      : pill === 'landed'
        ? 'text-success'
        : pill === 'parked'
          ? 'text-text-secondary'
          : 'text-text-tertiary';
  return <span className={`text-console-12 ${tone}`}>{PILL_LABEL[pill]}</span>;
}

const rested = (pill: Pill): 'landed' | 'failed' | 'parked' | 'waiting' =>
  pill === 'landed' || pill === 'failed' || pill === 'parked' ? pill : 'waiting';

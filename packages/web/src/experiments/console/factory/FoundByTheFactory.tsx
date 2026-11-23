import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { displayItemKey } from './lib/item-key';
import { Link, useLocation } from 'react-router';
import { EmptyNote } from '../components/EmptyNote';
import { SkeletonFigure, SkeletonGroup, SkeletonLine } from '../components/Skeleton';
import { formatDateTime } from '../lib/format';
import { errorDetail } from '../lib/http';
import type { FactoryDiscoveries } from '../skills/factory';
import { itemPath } from './lib/board';
import { readFailed } from './lib/deadline';
import { ShadowBadge } from './ShadowBadge';
import {
  type FactoryFinding,
  FOUND_BY_THE_FACTORY,
  foundChips,
  kindLabel,
  openFindings,
} from './lib/discoveries';
import { FactoryLoading } from './FactoryLoading';
import { StaleRead } from './StaleRead';
import { useFactoryDiscoveries } from './useFactoryDiscoveries';

const HEADING_ID = `${FOUND_BY_THE_FACTORY}-heading`;

/**
 * Scroll the panel into view once its read has answered, when the page was opened on it (the
 * Overview's tile links to the board's `?show=found`): once per page visit.
 */
function useScrollWhenOpened(ready: boolean): RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement>(null);
  const { key } = useLocation();
  const scrolled = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || scrolled.current === key) return;
    scrolled.current = key;
    ref.current?.scrollIntoView({ block: 'start' });
  }, [ready, key]);
  return ref;
}

/**
 * The board's "Found by the factory" panel: what the discoveries drains decided to file
 * from what agents noticed outside their scope, that no item on the project carries yet.
 * Read-only. Mount it only when the view declares `discoveries`. While the drains are a
 * shadow (the view says so) it reads as one: they decide what they would file and file
 * nothing. The Overview's tile opens it through the board's `?show=found`.
 */
export function FoundByTheFactory({
  projectId,
  above = true,
  oneLine = false,
  opened = false,
}: {
  projectId: string;
  /**
   * Whether what is drawn above the panel has its final height. The board passes false
   * until its columns are drawn: scrolling earlier would leave the panel pushed down.
   */
  above?: boolean;
  /**
   * Start as one line (the count and "show the findings"), which opens the full panel in
   * place: the board's columns keep the height at 1440x900. No top margin of its own: the
   * board's gap already sets it apart.
   */
  oneLine?: boolean;
  /** Opened on the panel (the board's `?show=found`): it starts open, its findings listed. */
  opened?: boolean;
}): ReactElement {
  const read = useFactoryDiscoveries(projectId);
  const ref = useScrollWhenOpened(opened && above && read.data !== undefined);
  const [expanded, setExpanded] = useState(!oneLine || opened);
  // Listed when the person asked for the findings: from the one line or from the tile.
  const [listed, setListed] = useState(oneLine && opened);
  return (
    <section
      ref={ref}
      id={FOUND_BY_THE_FACTORY}
      aria-labelledby={HEADING_ID}
      className={`relative flex scroll-mt-6 ${oneLine ? '' : 'mt-3'} flex-col gap-2 overflow-hidden rounded-console-12 border border-border bg-surface ${expanded ? 'p-4' : 'px-4 py-2'}`}
    >
      {/* The shadow accent (Visual standard, rule 10): the drains did nothing. */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-0.75 bg-[color:var(--node-opaque)]" />
      {expanded ? (
        <FoundBody projectId={projectId} read={read} listed={listed} />
      ) : (
        <FoundLine
          read={read}
          onOpen={() => {
            setListed(true);
            setExpanded(true);
          }}
        />
      )}
    </section>
  );
}

/**
 * The one-line panel: its name, the shadow badge, and "14 the factory would file · show the
 * findings", or what its read says when there is nothing to show yet.
 */
function FoundLine({
  read,
  onOpen,
}: {
  read: ReturnType<typeof useFactoryDiscoveries>;
  onOpen: () => void;
}): ReactElement {
  const { data } = read;
  const failed = data === undefined ? readFailed(read.error) : undefined;
  const findings = data === undefined ? [] : openFindings(data);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <h2 id={HEADING_ID} className="text-console-15 font-semibold text-text-primary">
        Found by the factory
      </h2>
      {data?.shadow === true ? <ShadowBadge /> : null}
      {data === undefined ? (
        failed === undefined ? (
          <FoundSkeleton read={read} />
        ) : (
          <p role="alert" className="text-console-13 text-error">
            What the factory found could not be read: {errorDetail(failed)}
          </p>
        )
      ) : findings.length === 0 ? (
        <span className="text-console-13 text-text-secondary">
          {data.shadow
            ? 'Nothing the factory would file now'
            : 'Nothing filed that is not on the board'}
        </span>
      ) : (
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span
            data-found-count
            className="text-console-17 font-semibold tabular-nums text-text-primary"
          >
            {findings.length}
          </span>
          <span className="text-console-13 text-text-secondary">
            {data.shadow ? 'the factory would file' : 'filed, not on the board yet'} ·
          </span>
          <button
            type="button"
            aria-expanded={false}
            aria-controls={FOUND_BY_THE_FACTORY}
            onClick={onOpen}
            className="text-console-13 text-accent transition-colors duration-150 ease-out hover:text-text-primary"
          >
            show the findings
          </button>
        </span>
      )}
    </div>
  );
}

/** The panel's contents for each state of its read. */
function FoundBody({
  projectId,
  read,
  listed,
}: {
  projectId: string;
  read: ReturnType<typeof useFactoryDiscoveries>;
  /** Whether the findings start listed. */
  listed: boolean;
}): ReactElement {
  const { data } = read;
  if (data === undefined) {
    const failed = readFailed(read.error);
    return (
      <>
        <Heading shadow={false} />
        {failed === undefined ? (
          <FoundSkeleton read={read} />
        ) : (
          <p role="alert" className="text-console-13 text-error">
            What the factory found could not be read: {errorDetail(failed)}
          </p>
        )}
      </>
    );
  }
  return (
    <>
      <Heading shadow={data.shadow} />
      <StaleRead error={read.error} />
      <FoundPanel projectId={projectId} read={data} listed={listed} />
    </>
  );
}

function Heading({ shadow }: { shadow: boolean }): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={HEADING_ID} className="text-console-17 font-semibold text-text-primary">
          Found by the factory
        </h2>
        {shadow ? <ShadowBadge /> : null}
      </div>
      {shadow ? (
        <p className="text-console-13 text-text-tertiary">
          Would file what agents noticed outside their work: the factory decides what it would file,
          and files nothing yet.
        </p>
      ) : null}
    </div>
  );
}

function FoundSkeleton({ read }: { read: ReturnType<typeof useFactoryDiscoveries> }): ReactElement {
  return (
    <FactoryLoading read={read}>
      <SkeletonGroup label="Reading what the factory found" className="flex flex-col gap-2">
        <SkeletonFigure />
        <SkeletonLine width="short" />
      </SkeletonGroup>
    </FactoryLoading>
  );
}

/** The count, the chips, and the findings behind a toggle. */
export function FoundPanel({
  projectId,
  read,
  listed = false,
}: {
  projectId: string;
  read: FactoryDiscoveries;
  /** Whether the findings start listed. */
  listed?: boolean;
}): ReactElement {
  const [open, setOpen] = useState(listed);
  const findings = openFindings(read);
  const covered = read.findings.length - findings.length;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-baseline gap-2">
        <span
          data-found-count
          className="text-console-22 font-semibold tabular-nums text-text-primary"
        >
          {findings.length}
        </span>
        <span className="text-console-13 text-text-secondary">
          {read.shadow ? 'the factory would file' : 'filed'}, not on the board yet
        </span>
      </p>
      <ul aria-label="What the drains decided" className="flex flex-wrap gap-2">
        {foundChips(read).map(chip => (
          <li
            key={chip.label}
            className="rounded bg-surface-inset px-1.5 py-0.5 text-console-12 text-[color:var(--node-opaque)]"
          >
            {chip.label} {chip.count}
          </li>
        ))}
      </ul>
      <MetaLines covered={covered} unreadable={read.unreadable} />
      {findings.length === 0 ? (
        <NothingFound shadow={read.shadow} />
      ) : (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${FOUND_BY_THE_FACTORY}-list`}
            onClick={() => {
              setOpen(value => !value);
            }}
            className="self-start text-console-13 text-accent transition-colors duration-150 ease-out hover:text-text-primary"
          >
            {open ? 'Hide the findings' : `Show the ${findings.length.toString()} findings`}
          </button>
          {open ? (
            <ul id={`${FOUND_BY_THE_FACTORY}-list`} className="flex flex-col gap-3">
              {findings.map(finding => (
                <FindingRow
                  key={`${finding.runId}:${finding.title}`}
                  projectId={projectId}
                  finding={finding}
                />
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}

function MetaLines({ covered, unreadable }: { covered: number; unreadable: number }): ReactNode {
  if (covered === 0 && unreadable === 0) return null;
  return (
    <p className="text-console-13 text-text-tertiary">
      {[
        covered > 0 ? `${covered.toString()} already on the board` : null,
        unreadable > 0
          ? `${unreadable.toString()} ${unreadable === 1 ? 'drain' : 'drains'} could not be read`
          : null,
      ]
        .filter(line => line !== null)
        .join(' · ')}
    </p>
  );
}

function NothingFound({ shadow }: { shadow: boolean }): ReactElement {
  return (
    <EmptyNote
      className="flex items-center gap-2"
      sentence={
        shadow
          ? 'Nothing the factory would file now. What agents notice after a delivery shows here.'
          : 'Nothing filed that is not on the board. What agents notice after a delivery shows here.'
      }
    />
  );
}

/** One finding: its kind, title, the item whose drain decided it, and how it was checked on hover. */
function FindingRow({
  projectId,
  finding,
}: {
  projectId: string;
  finding: FactoryFinding;
}): ReactElement {
  const kind = kindLabel(finding.kind);
  return (
    <li title={finding.verified ?? undefined} className="flex flex-col gap-2">
      {kind === null ? null : (
        <span className="text-console-12 font-medium uppercase tracking-console-label text-text-tertiary">
          {kind}
        </span>
      )}
      <span className="text-console-15 font-semibold text-text-primary">{finding.title}</span>
      <span className="text-console-13 text-text-secondary">
        from{' '}
        <Link
          to={itemPath(projectId, finding.from.key)}
          className="font-mono text-text-primary hover:underline"
        >
          {displayItemKey(finding.from.key, null)}
        </Link>
        {finding.from.title === null ? '' : ` · ${finding.from.title}`} ·{' '}
        {formatDateTime(finding.decidedAt)}
      </span>
      {finding.verified === null ? null : (
        <span className="sr-only">Verified: {finding.verified}</span>
      )}
    </li>
  );
}

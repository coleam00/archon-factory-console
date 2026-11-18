import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { Link, useLocation } from 'react-router';
import { Inbox } from 'lucide-react';
import { formatDateTime } from '../lib/format';
import { errorDetail } from '../lib/http';
import type { FactoryDiscoveries } from '../skills/factory';
import { itemPath } from './lib/board';
import { readFailed } from './lib/deadline';
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
const LINK_HASH = `#${FOUND_BY_THE_FACTORY}`;

/**
 * Scroll the panel into view once its read has answered, when the page was opened at its
 * hash (the Overview's tile links there). The router does not scroll to a hash itself.
 */
function useScrollWhenLinked(ready: boolean): RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement>(null);
  const { hash, key } = useLocation();
  const scrolled = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || hash !== LINK_HASH || scrolled.current === key) return;
    scrolled.current = key;
    ref.current?.scrollIntoView({ block: 'start' });
  }, [ready, hash, key]);
  return ref;
}

/**
 * The board's "Found by the factory" panel: what the discoveries drains decided to file
 * from what agents noticed outside their scope, that no item on the project carries yet.
 * Read-only. Mount it only when the view declares `discoveries`. While the drains are a
 * shadow (the view says so) it reads as one: they decide what they would file and file
 * nothing. The Overview's tile links here by `#found-by-the-factory`.
 */
export function FoundByTheFactory({
  projectId,
  above = true,
}: {
  projectId: string;
  /**
   * Whether what is drawn above the panel has its final height. The board passes false
   * until its columns are drawn: scrolling earlier would leave the panel pushed down.
   */
  above?: boolean;
}): ReactElement {
  const read = useFactoryDiscoveries(projectId);
  const ref = useScrollWhenLinked(above && read.data !== undefined);
  return (
    <section
      ref={ref}
      id={FOUND_BY_THE_FACTORY}
      aria-labelledby={HEADING_ID}
      className="relative mt-3 flex scroll-mt-6 flex-col gap-2 overflow-hidden rounded-console-12 border border-border bg-surface p-4"
    >
      {/* The shadow accent (Visual standard, rule 10): the drains did nothing. */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-0.75 bg-[color:var(--node-opaque)]" />
      <FoundBody projectId={projectId} read={read} />
    </section>
  );
}

/** The panel's contents for each state of its read. */
function FoundBody({
  projectId,
  read,
}: {
  projectId: string;
  read: ReturnType<typeof useFactoryDiscoveries>;
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
      <FoundPanel projectId={projectId} read={data} />
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
        {shadow ? (
          <span className="rounded border border-dashed border-[color:var(--node-opaque)] px-1.5 text-console-12 text-[color:var(--node-opaque)]">
            shadow
          </span>
        ) : null}
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
    <div className="flex flex-col gap-2">
      <span
        aria-hidden
        className="h-5.5 w-12 rounded bg-surface-elevated motion-safe:animate-pulse"
      />
      <span
        aria-hidden
        className="h-3 w-2/5 rounded bg-surface-elevated motion-safe:animate-pulse"
      />
      <span className="sr-only">
        <FactoryLoading read={read} label="Reading what the factory found" />
      </span>
    </div>
  );
}

/** The count, the chips, and the findings behind a toggle. */
export function FoundPanel({
  projectId,
  read,
}: {
  projectId: string;
  read: FactoryDiscoveries;
}): ReactElement {
  const [open, setOpen] = useState(false);
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
    <p className="flex items-center gap-2 text-console-14 text-text-secondary">
      <Inbox aria-hidden className="size-5 text-text-tertiary" />
      {shadow
        ? 'Nothing the factory would file now. What agents notice after a delivery shows here.'
        : 'Nothing filed that is not on the board. What agents notice after a delivery shows here.'}
    </p>
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
          #{finding.from.key}
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

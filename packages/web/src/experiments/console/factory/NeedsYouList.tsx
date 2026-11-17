import { useState, type ReactElement, type ReactNode } from 'react';
import { errorDetail } from '../lib/http';
import type { AttentionQueue } from '../skills/runs';
import type { EntityView } from '../store/cache';
import { NEEDS_YOU_SHOWN, needsYou, visibleNeedsYou, type NeedsYouItem } from './lib/needs-you';
import { NeedsYouLine } from './NeedsYouLine';

/**
 * The Overview's Needs-you section: every open ask and paused wait, newest first, one line
 * each until opened and answered in place. It shows the newest few and says how many more
 * there are, with "show all", so the map's top stays in the first screen.
 */
export function NeedsYouList({
  projectId,
  attention,
}: {
  projectId: string;
  attention: EntityView<AttentionQueue>;
}): ReactElement {
  const items = attention.data === undefined ? [] : needsYou(attention.data.items);
  return (
    <section id="needs-you" className="flex max-w-5xl flex-col gap-2.5">
      <h3 className="text-console-11 font-medium uppercase tracking-wider text-text-tertiary">
        Needs you{attention.data === undefined ? '' : ` · ${items.length.toString()}`}
      </h3>
      <NeedsYouBody projectId={projectId} attention={attention} items={items} />
    </section>
  );
}

function NeedsYouBody({
  projectId,
  attention,
  items,
}: {
  projectId: string;
  attention: EntityView<AttentionQueue>;
  items: NeedsYouItem[];
}): ReactNode {
  const { data, error } = attention;
  if (data === undefined) {
    if (error !== undefined)
      return (
        <p role="alert" className="text-sm text-error">
          What needs you could not be loaded: {errorDetail(error)}
        </p>
      );
    return <p className="text-xs text-text-tertiary">Loading…</p>;
  }
  return (
    <>
      {data.degraded.length > 0 ? (
        <p role="alert" className="text-console-12 text-warning">
          {data.degraded.length === 1
            ? 'One paused run could not be read, so what it waits on is not listed.'
            : `${data.degraded.length.toString()} paused runs could not be read, so what they wait on is not listed.`}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="text-sm text-text-secondary">Nothing is waiting on a person.</p>
      ) : (
        <NeedsYouLines projectId={projectId} items={items} queue={data} />
      )}
    </>
  );
}

/** The lines, capped; which are open and whether all show is held here, across refreshes. */
function NeedsYouLines({
  projectId,
  items,
  queue,
}: {
  projectId: string;
  items: NeedsYouItem[];
  queue: AttentionQueue;
}): ReactElement {
  const [showAll, setShowAll] = useState(false);
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const { shown, hidden } = visibleNeedsYou(items, { showAll, opened });
  const toggle = (ref: string): void => {
    setOpened(current => {
      const next = new Set(current);
      if (!next.delete(ref)) next.add(ref);
      return next;
    });
  };
  const more = 'self-start text-console-12 text-accent-bright hover:underline';
  return (
    <>
      <ul className="flex flex-col gap-2">
        {shown.map(item => (
          <NeedsYouLine
            key={item.ref}
            projectId={projectId}
            item={item}
            queue={queue}
            open={opened.has(item.ref)}
            onToggle={() => {
              toggle(item.ref);
            }}
          />
        ))}
      </ul>
      {hidden > 0 ? (
        <button type="button" className={more} onClick={() => setShowAll(true)}>
          {`${hidden.toString()} more · show all ${items.length.toString()}`}
        </button>
      ) : null}
      {showAll && items.length > NEEDS_YOU_SHOWN ? (
        <button type="button" className={more} onClick={() => setShowAll(false)}>
          Show fewer
        </button>
      ) : null}
    </>
  );
}

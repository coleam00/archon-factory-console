import type { ReactElement } from 'react';
import { optionName } from '../components/AttentionAnswerPanel';
import { relativeTime } from '../lib/format';
import type { AttentionQueue } from '../skills/runs';
import type { NeedsYouItem } from './lib/needs-you';
import { RowContent, RowSubject } from './NeedsYouRow';

/** The question the line names, in one line. */
function lineMessage(item: NeedsYouItem): string {
  return item.kind === 'unreadable' ? item.detail : item.message;
}

/** What answering takes, in a few words: the recommended option when the ask has one. */
export function lineLabel(item: NeedsYouItem): string {
  switch (item.kind) {
    case 'attention': {
      const { recommendation, options, form } = item;
      if (recommendation !== undefined) {
        const recommended = options.find(option => option.id === recommendation.option);
        return `Recommended: ${recommended === undefined ? recommendation.option : optionName(recommended)}`;
      }
      if (form === 'message') return 'Answer in words';
      return `${options.length.toString()} options`;
    }
    case 'awaiting_response':
      return 'Approve or reject';
    case 'unreadable':
      return 'Could not be read';
  }
}

/**
 * One open ask or paused wait on the Overview: a single line (item, question, recommended
 * option) until opened; opened, the same answer form the item page shows, answered in place.
 * The list owns whether it is open, so a row survives a refresh of the queue.
 */
export function NeedsYouLine({
  projectId,
  item,
  queue,
  open,
  onToggle,
}: {
  projectId: string;
  item: NeedsYouItem;
  queue: AttentionQueue;
  open: boolean;
  onToggle: () => void;
}): ReactElement {
  const message = lineMessage(item);
  return (
    <li className="flex flex-col gap-1.5 rounded-console-12 border border-warning/40 bg-surface px-3 py-2">
      {/* One line from sm up; at phone width the question takes a second line so it stays readable. */}
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 whitespace-nowrap text-console-12 text-text-tertiary sm:flex-nowrap">
        <RowSubject projectId={projectId} item={item} />
        {item.pausedAt === null ? null : <span>{relativeTime(item.pausedAt)}</span>}
        {open ? (
          <span className="flex-1" />
        ) : (
          <>
            <span
              title={message}
              className="min-w-0 flex-1 truncate text-sm text-text-primary max-sm:order-last max-sm:basis-full"
            >
              {message}
            </span>
            <span className="min-w-0 truncate text-warning max-sm:flex-1 sm:max-w-[45%]">
              {lineLabel(item)}
            </span>
          </>
        )}
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="shrink-0 rounded border border-border px-2 py-0.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        >
          {open ? 'Close' : 'Open'}
        </button>
      </div>
      {open ? <RowContent projectId={projectId} item={item} queue={queue} /> : null}
    </li>
  );
}

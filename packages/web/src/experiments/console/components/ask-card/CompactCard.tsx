import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { optionLabel, recommendationWhy, tileOrder } from '../../lib/ask-card';
import type { NeedsYouItem } from '../../lib/needs-you';

// console-token-exception max-w-[760px] -- Visual standard rule 9: an ask card is at most 760 px wide in a page.
const WIDTH = 'max-w-[760px]';

/** The one choice a compact card shows: the recommended option, else the first; words for the rest. */
function shown(ask: NeedsYouItem): { label: string; detail?: string; recommended: boolean } {
  switch (ask.kind) {
    case 'attention': {
      const first = tileOrder(ask)[0];
      if (ask.form === 'message' || first === undefined)
        return { label: 'Answer in words', recommended: false };
      const recommended = first.id === ask.recommendation?.option;
      const detail =
        recommended && ask.recommendation !== undefined
          ? recommendationWhy(ask.recommendation)
          : first.does;
      return {
        label: optionLabel(ask, first),
        ...(detail === undefined ? {} : { detail }),
        recommended,
      };
    }
    case 'awaiting_response':
      return { label: 'A gate waits for your decision', recommended: false };
    case 'owner_lost':
    case 'unreadable':
      return { label: 'Resume or abandon it on the run', recommended: false };
  }
}

/**
 * The ask card's compact variant (the Overview): one line of what it is about, then the
 * question on one line beside the recommended tile, drawn as a tile but not a control, and
 * Open, which answers it on the Needs you tab. Nothing here sends an answer. Three of these
 * leave the top of the map in a 1440x900 first screen (Visual standard, Layout).
 */
export function CompactCard({
  ask,
  question,
  header,
  openHref,
}: {
  ask: NeedsYouItem;
  question: string;
  header: ReactNode;
  openHref: string | undefined;
}): ReactElement {
  const tile = shown(ask);
  return (
    <article
      aria-label={question}
      data-ask={ask.ref}
      className={`@container flex w-full ${WIDTH} flex-col gap-2 rounded-console-16 border border-border bg-surface p-4`}
    >
      {header}
      <div className="flex flex-col gap-2 @min-[520px]:flex-row @min-[520px]:items-center @min-[520px]:gap-3">
        <h3
          title={question}
          className="line-clamp-2 min-w-0 flex-1 text-console-15 font-semibold text-text-primary @min-[520px]:line-clamp-1"
        >
          {question}
        </h3>
        <div
          title={tile.detail}
          className={`flex shrink-0 items-baseline gap-2 self-start rounded-console-12 border px-3 py-1.5 @min-[520px]:self-auto ${
            tile.recommended
              ? 'border-accent-muted bg-[color:var(--accent-soft)]'
              : 'border-border bg-surface'
          }`}
        >
          <span className="text-console-14 font-semibold text-text-primary">{tile.label}</span>
          {tile.recommended ? (
            <span className="text-console-12 font-medium text-accent">Recommended</span>
          ) : null}
        </div>
        {openHref === undefined ? null : (
          <Link
            to={openHref}
            className="self-start rounded-console-12 border border-border px-3 py-1.5 text-console-13 font-medium text-text-primary transition-colors duration-150 ease-out hover:border-border-bright hover:bg-surface-elevated @min-[520px]:self-auto"
          >
            Open
          </Link>
        )}
      </div>
    </article>
  );
}

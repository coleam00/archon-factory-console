import type { ReactElement } from 'react';
import type { Box } from '../lib/map-layout';
import { OVERVIEW_SMALL_TEXT, OVERVIEW_TITLE_TEXT } from '../lib/overview-layout';
import type { OverviewCard as Card } from '../lib/overview-nav';
import { ICONS, KINDS } from './overview-kinds';

/*
 * Sizes are world px on a canvas the camera scales (about 0.44 on the page at 1440x900, more
 * full screen): the title is OVERVIEW_TITLE_TEXT and everything else OVERVIEW_SMALL_TEXT
 * (overview-layout.ts), held by its test to draw at 14 px and at the type floor fitted.
 */

/**
 * One card: its kind's colour along the top, its icon and kind, its title and line of text. A
 * card that opens a view is a button marked ⤢. It fills its grid cell, or with `fit="content"`
 * (a parallel group's member) is as tall as its text, centred on the cell's middle row, where
 * every line into or out of it lands.
 */
export function OverviewCard({
  card,
  box,
  fit,
  onOpen,
}: {
  card: Card;
  box: Box;
  fit: 'cell' | 'content';
  onOpen: (view: string) => void;
}): ReactElement {
  const kind = KINDS[card.kind];
  const Icon = ICONS[card.icon];
  const body = (
    <>
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-2"
        style={{ background: kind.color }}
      />
      <span
        className={`flex items-center gap-3 ${OVERVIEW_SMALL_TEXT} font-medium uppercase text-text-tertiary`}
      >
        <Icon aria-hidden="true" className="size-8 shrink-0" style={{ color: kind.color }} />
        {kind.label}
        {card.opens === undefined ? null : (
          <span aria-hidden="true" className={`ml-auto ${OVERVIEW_SMALL_TEXT} text-text-secondary`}>
            ⤢
          </span>
        )}
      </span>
      <span className={`${OVERVIEW_TITLE_TEXT} font-semibold leading-tight text-text-primary`}>
        {card.title}
      </span>
      <span className={`${OVERVIEW_SMALL_TEXT} leading-snug text-text-secondary`}>{card.text}</span>
    </>
  );
  const frame =
    'absolute flex flex-col gap-3 overflow-hidden rounded-console-16 border-2 bg-surface px-5 pb-5 pt-6 text-left';
  const style =
    fit === 'cell'
      ? { left: box.x, top: box.y, width: box.w, height: box.h }
      : {
          left: box.x,
          top: box.y + box.h / 2,
          width: box.w,
          maxHeight: box.h,
          transform: 'translateY(-50%)',
        };
  if (card.opens === undefined)
    return (
      <div data-card={card.id} className={`${frame} border-border`} style={style}>
        {body}
      </div>
    );
  const opens = card.opens;
  return (
    <button
      type="button"
      data-card={card.id}
      aria-label={`${card.title}: open a closer look`}
      onClick={() => onOpen(opens)}
      className={`${frame} cursor-pointer border-border-bright transition-colors hover:border-accent-bright hover:bg-surface-elevated`}
      style={style}
    >
      {body}
    </button>
  );
}

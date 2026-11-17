import type { ReactElement } from 'react';
import { Link } from 'react-router';
import type { FactoryStage } from '../lib/stage-steps';
import type { Box } from '../lib/map-layout';
import type { StageLive } from '../lib/map-live';
import { GROUPS } from './MapLegend';

interface MapCardProps {
  stage: FactoryStage;
  box: Box;
  live: StageLive;
  /** Stage notes the declaration places by this card. */
  notes: readonly string[];
  selected: boolean;
  /** The stage page's path, which a click on the card opens. */
  openTo: string;
  /** The details button: the map shows or hides this stage's details panel. */
  onDetails: (stage: string) => void;
}

/** One stage on the map: its colour, label, blurb and live chips; a click opens its stage page. */
export function MapCard({
  stage,
  box,
  live,
  notes,
  selected,
  openTo,
  onDetails,
}: MapCardProps): ReactElement {
  const color = GROUPS[stage.group].color;
  return (
    <div
      data-stage={stage.id}
      className="absolute"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      <Link
        to={openTo}
        aria-label={`${stage.label}: ${chipWords(live)}`}
        // A link is natively draggable: a pan that starts on the card would become a link drag
        // the map never sees.
        draggable={false}
        className={`relative flex size-full flex-col gap-1 overflow-hidden rounded-console-12 border bg-surface py-2.5 pl-4 pr-3 text-left transition-colors hover:bg-surface-elevated ${
          selected ? 'border-accent-bright ring-2 ring-accent-muted' : 'border-border'
        }`}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-2.5 left-1.5 w-1 rounded-full"
          style={{ background: color }}
        />
        <span className="truncate pr-5 text-console-17 font-medium text-text-primary">
          {stage.label}
        </span>
        {/* The map's sizing comment (map-layout.ts) says what this draws at when fitted. The
            clamp only guards a blurb longer than any card holds; the panel shows it whole. */}
        <span className="line-clamp-5 text-console-15 leading-snug text-text-secondary">
          {stage.blurb}
        </span>
        {notes.map(note => (
          <span key={note} className="truncate text-console-15 italic text-text-tertiary">
            {note}
          </span>
        ))}
        <span className="mt-auto flex flex-wrap gap-1">
          <Chips live={live} />
        </span>
      </Link>
      {/* Beside the card's link, not in it: a button inside a link is invalid. */}
      <button
        type="button"
        aria-label={`${stage.label} details`}
        aria-pressed={selected}
        title="Details"
        // A press on the button must not start a pan of the map under it.
        onPointerDown={event => event.stopPropagation()}
        onClick={() => onDetails(stage.id)}
        className="absolute right-1.5 top-1.5 rounded px-1 text-console-15 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
      >
        ⓘ
      </button>
    </div>
  );
}

function chipWords(live: StageLive): string {
  const parts = [`${live.items.length.toString()} here`];
  if (live.working > 0) parts.push(`${live.working.toString()} being worked`);
  if (live.needYou.length > 0) parts.push(needYouWords(live.needYou.length));
  return parts.join(', ');
}

const needYouWords = (n: number): string => `${n.toString()} ${n === 1 ? 'needs' : 'need'} you`;

/** "N here", in the running colour and pulsing while a run works one, and "N need you" in the page's one loud colour. */
function Chips({ live }: { live: StageLive }): ReactElement | null {
  const here = live.items.length;
  const waiting = live.needYou.length;
  if (here === 0 && waiting === 0) return null;
  return (
    <>
      {here > 0 ? (
        <span
          data-chip="here"
          className={`rounded-full px-2 text-console-15 font-medium ${
            live.working > 0
              ? 'bg-[color:var(--running-soft)] text-[color:var(--running)] motion-safe:animate-pulse'
              : 'bg-surface-elevated text-text-secondary'
          }`}
        >
          {here} here
        </span>
      ) : null}
      {waiting > 0 ? (
        <span
          data-chip="need-you"
          className="rounded-full bg-warning/20 px-2 text-console-15 font-semibold text-warning"
        >
          {needYouWords(waiting)}
        </span>
      ) : null}
    </>
  );
}

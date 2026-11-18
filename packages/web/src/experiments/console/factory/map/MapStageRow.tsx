import type { ReactElement } from 'react';
import { Link } from 'react-router';
import type { StageRead } from '../lib/map-live';
import type { FactoryStage } from '../lib/stage-steps';
import { ShadowBadge } from '../ShadowBadge';
import { chipWords, HereChip, NeedsYouChip } from './MapChips';

/**
 * One stage inside a card of several, two 20 px lines (map-sizes.ts sizes the card from them):
 * its label (with the shadow badge when it holds a shadow step) with how many sit there, then
 * who needs you there, or else its short line. A click opens its stage page.
 */
export function MapStageRow({
  stage,
  live,
  openTo,
  shadow,
}: {
  stage: FactoryStage;
  live: StageRead;
  openTo: string;
  shadow: boolean;
}): ReactElement {
  return (
    <Link
      to={openTo}
      data-stage={stage.id}
      aria-label={`${stage.label}: ${chipWords(live)}`}
      // A link is natively draggable: a pan that starts on the card would become a link drag
      // the map never sees.
      draggable={false}
      className="-mx-1.5 flex flex-col rounded px-1.5 transition-colors duration-150 ease-out hover:bg-surface-hover"
    >
      <span className="flex h-5 items-center gap-2">
        <span className="min-w-0 truncate text-console-13 font-medium text-text-primary">
          {stage.label}
        </span>
        {shadow ? <ShadowBadge className="leading-4" /> : null}
        <span className="ml-auto flex">
          <HereChip live={live} />
        </span>
      </span>
      <span className="flex h-5 min-w-0 items-center">
        {typeof live !== 'string' && live.needYou.length > 0 ? (
          <NeedsYouChip live={live} />
        ) : (
          <span className="truncate text-console-12 text-text-tertiary">
            {stage.short ?? stage.blurb}
          </span>
        )}
      </span>
    </Link>
  );
}

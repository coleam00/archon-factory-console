import type { ReactElement } from 'react';
import type { DrilldownCard as Card } from '../lib/drilldown-live';
import type { ItemOnStep } from '../lib/items-on-step';
import type { FactoryViewListed } from '../lib/views';
import { RunningItemLinks } from '../RunningItems';
import { ShadowBadge } from '../ShadowBadge';
import { cardTone } from '../tones';
import { ICONS, KINDS } from './drilldown-kinds';

/**
 * One card of a drill-down: its kind's colour along the top, its icon and kind, its title and
 * line of text. The card is a button that opens its real steps; the items on it now are named
 * under it, outside the button, since each is a link. It is lit in the running colour while
 * items are on it, still, as the step graph glows: the items read carries no owner liveness.
 * Its box is `.factory-card`'s (theme.css), tinted in its kind's colour. A card standing for a
 * shadow step (rule 10) carries the shadow badge and a `--node-opaque` bar and tint, and says
 * what it decided lately.
 */
export function DrilldownCard({
  view,
  projectId,
  card,
  onCard,
  selected,
  onSelect,
  shadow,
}: {
  view: FactoryViewListed['declaration'];
  projectId: string;
  card: Card;
  /** The items on a step the card covers now; empty when none, or when the read failed. */
  onCard: readonly ItemOnStep[];
  selected: boolean;
  onSelect: () => void;
  /**
   * Set when the card stands for a shadow step: `lately` is what it decided on the newest
   * items ("last 5: would ask you first ×5"), one line per shadow it covers; empty when none.
   */
  shadow: { lately: readonly string[] } | null;
}): ReactElement {
  const kind = KINDS[card.kind];
  const Icon = ICONS[card.icon];
  const live = onCard.length > 0;
  const tone = live ? 'var(--running)' : shadow === null ? kind.color : 'var(--node-opaque)';
  return (
    <article
      data-live={live ? 'true' : undefined}
      data-lit={live ? '' : undefined}
      // A selected card keeps its accent border and ring; a lit one still glows.
      data-selected={selected ? '' : undefined}
      className="factory-card relative flex flex-col overflow-hidden rounded-console-12 border"
      style={cardTone(tone)}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-0.75"
        style={{ background: shadow === null ? kind.color : 'var(--node-opaque)' }}
      />
      <button
        type="button"
        aria-expanded={selected}
        onClick={onSelect}
        className="flex cursor-pointer flex-col gap-2 p-4 text-left transition-colors duration-150 ease-out hover:bg-surface-elevated"
      >
        <span className="flex items-center gap-2 text-console-12 font-medium uppercase tracking-console-label text-text-tertiary">
          <Icon aria-hidden="true" className="size-4 shrink-0" style={{ color: kind.color }} />
          {kind.label}
          {shadow === null ? null : <ShadowBadge className="ml-auto normal-case tracking-normal" />}
        </span>
        <span className="line-clamp-2 text-console-15 font-semibold leading-snug text-text-primary">
          {card.title}
        </span>
        <span title={card.text} className="line-clamp-2 text-console-13 text-text-secondary">
          {card.text}
        </span>
        {shadow?.lately.map(line => (
          <span key={line} className="text-console-13 text-text-tertiary">
            {line}
          </span>
        ))}
      </button>
      {live ? (
        <div className="border-t border-border px-4 py-2.5">
          <RunningItemLinks view={view} projectId={projectId} items={onCard} />
        </div>
      ) : null}
    </article>
  );
}

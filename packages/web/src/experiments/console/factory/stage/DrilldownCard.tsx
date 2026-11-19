import type { ReactElement } from 'react';
import type { DrilldownCard as Card } from '../lib/drilldown-live';
import type { ItemOnStep } from '../lib/items-on-step';
import type { FactoryViewListed } from '../lib/views';
import { RunningItemLinks } from '../RunningItems';
import { ShadowBadge } from '../ShadowBadge';
import { RUNNING_GLOW } from '../StepGraph';
import { ICONS, KINDS } from './drilldown-kinds';

/**
 * One card of a drill-down: its kind's colour along the top, its icon and kind, its title and
 * line of text. The card is a button that opens its real steps; the items on it now are named
 * under it, outside the button, since each is a link. It glows still, as the step graph does:
 * the items read carries no owner liveness. A card standing for a shadow step (rule 10)
 * carries the shadow badge and a `--node-opaque` bar, and says what it decided lately.
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
  return (
    <article
      data-live={live ? 'true' : undefined}
      className="relative flex flex-col overflow-hidden rounded-console-16 border-2 bg-surface"
      // Border colours go inline: the console root's `* { border-color }` outranks a utility.
      // A selected card keeps its accent border; the glow still tints and rings it.
      style={{
        ...(live ? RUNNING_GLOW : {}),
        ...(selected ? { borderColor: 'var(--accent-bright)' } : {}),
      }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ background: shadow === null ? kind.color : 'var(--node-opaque)' }}
      />
      <button
        type="button"
        aria-expanded={selected}
        onClick={onSelect}
        className="flex cursor-pointer flex-col gap-1.5 px-4 pb-4 pt-5 text-left transition-colors hover:bg-surface-elevated"
      >
        <span className="flex items-center gap-2 text-console-12 font-medium uppercase tracking-wider text-text-tertiary">
          <Icon aria-hidden="true" className="size-5 shrink-0" style={{ color: kind.color }} />
          {kind.label}
          {shadow === null ? null : <ShadowBadge className="ml-auto normal-case tracking-normal" />}
        </span>
        <span className="text-console-17 font-semibold leading-tight text-text-primary">
          {card.title}
        </span>
        <span className="text-console-15 leading-snug text-text-secondary">{card.text}</span>
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

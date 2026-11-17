import type { ReactElement } from 'react';
import type { DrilldownCard as Card } from '../lib/drilldown-live';
import type { ItemOnStep } from '../lib/items-on-step';
import type { FactoryViewListed } from '../lib/views';
import { RunningItemLinks } from '../RunningItems';
import { RUNNING_GLOW } from '../StepGraph';
import { ICONS, KINDS } from './drilldown-kinds';

/**
 * One card of a drill-down: its kind's colour along the top, its icon and kind, its title and
 * line of text. The card is a button that opens its real steps; the items on it now are named
 * under it, outside the button, since each is a link. It glows still, as the step graph does:
 * the items read carries no owner liveness.
 */
export function DrilldownCard({
  view,
  projectId,
  card,
  onCard,
  selected,
  onSelect,
}: {
  view: FactoryViewListed['declaration'];
  projectId: string;
  card: Card;
  /** The items on a step the card covers now; empty when none, or when the read failed. */
  onCard: readonly ItemOnStep[];
  selected: boolean;
  onSelect: () => void;
}): ReactElement {
  const kind = KINDS[card.kind];
  const Icon = ICONS[card.icon];
  const live = onCard.length > 0;
  return (
    <article
      data-live={live ? 'true' : undefined}
      className={`relative flex flex-col overflow-hidden rounded-console-16 border-2 bg-surface ${
        selected ? 'border-accent-bright' : 'border-border'
      }`}
      // A selected card keeps its accent border; the glow still tints and rings it.
      style={live ? { ...RUNNING_GLOW, ...(selected ? { borderColor: undefined } : {}) } : {}}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ background: kind.color }}
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
        </span>
        <span className="text-console-17 font-semibold leading-tight text-text-primary">
          {card.title}
        </span>
        <span className="text-console-15 leading-snug text-text-secondary">{card.text}</span>
      </button>
      {live ? (
        <div className="border-t border-border px-4 py-2.5">
          <RunningItemLinks view={view} projectId={projectId} items={onCard} />
        </div>
      ) : null}
    </article>
  );
}

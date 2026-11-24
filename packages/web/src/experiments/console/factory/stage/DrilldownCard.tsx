import type { ReactElement } from 'react';
import type { DrilldownCard as Card } from '../lib/drilldown-live';
import type { ItemOnStep } from '../lib/items-on-step';
import { engineIdTitle, stepLabel } from '../lib/step-label';
import type { FactoryViewListed } from '../lib/views';
import { RunningItemLinks } from '../RunningItems';
import { cardTone } from '../tones';
import { ICONS, KINDS } from './drilldown-kinds';

/**
 * One card of a drill-down: its kind's colour along the top, its icon and kind, its title and
 * line of text. It is plain text: a step has no page of its own (DESIGN.md, v2 direction). The
 * items on a step it covers now are named under it. While items are on it, it wears the running
 * border and ring (`data-running`), held still: the items read carries no owner liveness. Its
 * box is `.factory-card`'s (theme.css), tinted in its kind's colour.
 */
export function DrilldownCard({
  view,
  projectId,
  card,
  onCard,
}: {
  view: FactoryViewListed['declaration'];
  projectId: string;
  card: Card;
  /** The items on a step the card covers now; empty when none, or when the read failed. */
  onCard: readonly ItemOnStep[];
}): ReactElement {
  const kind = KINDS[card.kind];
  const Icon = ICONS[card.icon];
  const live = onCard.length > 0;
  const workflow = card.covers[0]?.workflow;
  const step = card.covers[0]?.steps[0];
  // The schema holds `covers` and each cover's `steps` to at least one.
  if (workflow === undefined || step === undefined)
    throw new Error(`The drill-down card "${card.title}" stands for no step`);
  const label = stepLabel(view, workflow, step);
  return (
    <article
      data-live={live ? 'true' : undefined}
      data-running={live ? '' : undefined}
      className="factory-card relative flex flex-col overflow-hidden rounded-console-12 border"
      style={cardTone(kind.color)}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-0.75"
        style={{ background: kind.color }}
      />
      <div title={engineIdTitle(label, step)} className="flex flex-col gap-2 p-4 text-left">
        <span className="flex items-center gap-2 text-console-12 font-medium uppercase tracking-console-label text-text-tertiary">
          <Icon aria-hidden="true" className="size-4 shrink-0" style={{ color: kind.color }} />
          {kind.label}
        </span>
        <span className="line-clamp-2 text-console-15 font-semibold leading-snug text-text-primary">
          {card.title}
        </span>
        <span title={card.text} className="line-clamp-2 text-console-13 text-text-secondary">
          {card.text}
        </span>
      </div>
      {live ? (
        <div className="border-t border-border px-4 py-2.5">
          <RunningItemLinks view={view} projectId={projectId} items={onCard} />
        </div>
      ) : null}
    </article>
  );
}

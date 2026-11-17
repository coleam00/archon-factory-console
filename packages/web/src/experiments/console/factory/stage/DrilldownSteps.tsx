import { X } from 'lucide-react';
import { useEffect, useRef, type ReactElement } from 'react';
import { Link } from 'react-router';
import type { DrilldownCard } from '../lib/drilldown-live';
import type { FactoryStage, StepPageState } from '../lib/stage-steps';
import { engineIdTitle, stepLabel } from '../lib/step-label';
import { factoryPath, type FactoryViewListed } from '../lib/views';

/**
 * The real steps a card stands for, each by its display name and linking to its step page,
 * which leads back to this stage. Grouped by workflow when the stage lists more than one.
 */
export function DrilldownSteps({
  projectId,
  view,
  stage,
  card,
  onClose,
}: {
  projectId: string;
  view: FactoryViewListed['declaration'];
  stage: FactoryStage;
  card: DrilldownCard;
  onClose: () => void;
}): ReactElement {
  const named = stage.workflows.length > 1;
  // The panel opens under the phases, below the fold of a projected screen; bring it into view.
  const panel = useRef<HTMLElement>(null);
  // On mount only: the parent keys the panel by the picked card, and a views refresh that
  // hands back a new card object must not scroll the page back here.
  useEffect(() => {
    panel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, []);
  return (
    <section
      ref={panel}
      aria-label={`The real steps of ${card.title}`}
      className="flex flex-col gap-3 rounded-console-16 border bg-surface p-4"
      // Inline: the console root's `* { border-color }` outranks a border colour utility.
      style={{ borderColor: 'var(--border-bright)' }}
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h4 className="text-console-17 font-semibold text-text-primary">{card.title}</h4>
          <p className="text-console-13 text-text-tertiary">The real steps this card stands for</p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded p-1 text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      {card.covers.map((cover, k) => (
        // Keyed by position: two covers of one card may name the same workflow.
        <div key={k} className="flex flex-col gap-1.5">
          {named ? (
            <h5 className="font-mono text-console-12 font-semibold text-text-secondary">
              {cover.workflow}
            </h5>
          ) : null}
          <ul className="flex flex-col gap-1">
            {cover.steps.map(step => {
              const label = stepLabel(view, cover.workflow, step);
              return (
                <li key={step}>
                  <Link
                    to={factoryPath(
                      projectId,
                      `/steps/${encodeURIComponent(cover.workflow)}/${encodeURIComponent(step)}`
                    )}
                    state={{ fromStage: stage.id } satisfies StepPageState}
                    title={engineIdTitle(label, step)}
                    className="text-console-15 text-accent-bright hover:underline"
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

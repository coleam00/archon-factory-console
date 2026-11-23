import { Hourglass } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';
import { Panel, SectionHeading } from '../../factory/document';
import { AwaitsBody } from '../../factory/ItemAwaits';
import { factoryPath } from '../../factory/lib/views';
import type { FactoryItem } from '../../skills/factory';

/**
 * The factory items waiting on you with no ask open (`awaitingItems`): an item triage or your
 * answer sent back to shaping, a change the factory could not close. Nothing here is answered
 * in place; each panel says what the item waits on and opens it. A filled panel with the
 * needs-you colour as its left bar, never the ping, which only an open ask has (Visual
 * standard, rules 5 and 7).
 */
export function AwaitingSection({
  projectId,
  items,
}: {
  projectId: string;
  items: readonly FactoryItem[];
}): ReactElement {
  return (
    <section
      data-doc-section=""
      data-needs-you="awaiting"
      aria-labelledby="needs-you-awaiting"
      className="flex min-w-0 flex-col gap-3 lg:col-span-2"
    >
      <SectionHeading
        id="needs-you-awaiting"
        icon={Hourglass}
        eyebrow="Waiting on you"
        title="Items to shape or settle"
        tone="var(--warning)"
        count={items.length}
      />
      {items.map(item => {
        const awaits = item.progress?.awaits;
        if (awaits == null) return null;
        const { key } = item.item;
        return (
          <Panel
            key={key}
            as="article"
            tone="var(--warning)"
            bar="left"
            aria-label={`${awaits.label}: ${key}`}
            className="flex flex-col gap-3 p-5 pl-6"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-console-12 font-medium uppercase tracking-console-label text-warning">
                {awaits.label}
              </span>
              <h3 className="min-w-0 text-console-15 font-semibold text-text-primary">
                <Link
                  to={factoryPath(projectId, `/items/${encodeURIComponent(key)}`)}
                  className="hover:underline"
                >
                  <span className="mr-2 font-mono text-text-tertiary">#{key}</span>
                  {item.progress?.title ?? key}
                </Link>
              </h3>
            </div>
            <AwaitsBody awaits={awaits} />
          </Panel>
        );
      })}
    </section>
  );
}

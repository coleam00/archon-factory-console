import type { ReactElement } from 'react';
import { BookOpen, MessageCircleQuestion } from 'lucide-react';
import type { FactoryItem } from './api';
import { Panel, SectionHeading } from './document';
import { ItemAsksBody } from './ItemAsksBody';
import { ItemAwaitsPanel, type Awaits } from './ItemAwaits';
import type { StoryPanel } from './lib/item-story';
import type { FactoryViewListed } from './lib/views';
import { DrainStoryPanel, MergedStoryPanel, StageStoryPanel } from './StoryPanel';
import { EmptyNote } from './ui/EmptyNote';
import type { FactoryAsks } from './useItemAsks';

/**
 * The item's story (owner change 8): what waits on you first, in Archon's own ask section
 * (answerable in place, and shown as answered once answered here), then one panel per stage
 * visit in the order it ran, each with the asks it left answered where they happened. An item
 * waiting on you with no ask open says what it waits on first.
 */
export function ItemStory({
  projectId,
  view,
  panels,
  item,
  asks,
  awaits,
}: {
  projectId: string;
  view: FactoryViewListed;
  panels: readonly StoryPanel[];
  item: Pick<FactoryItem, 'item' | 'questions'>;
  asks: FactoryAsks;
  /** What the item waits on when its pill is `awaits`; null otherwise. */
  awaits: Awaits | null;
}): ReactElement {
  const section = asks.sectionOf(item);
  const waiting = asks.entriesOf(item).length > 0 || section.answered.length > 0;
  return (
    <div className="flex min-w-0 flex-col gap-4" aria-label="The story">
      {awaits === null ? null : <ItemAwaitsPanel awaits={awaits} />}
      {waiting ? (
        <Panel
          as="section"
          tone="var(--warning)"
          bar="left"
          aria-labelledby="story-waiting"
          className="flex flex-col gap-3 py-4 pl-6 pr-5"
        >
          <SectionHeading
            id="story-waiting"
            icon={MessageCircleQuestion}
            eyebrow="Needs you"
            title="Waiting on you"
            tone="var(--warning)"
          />
          <ItemAsksBody projectId={projectId} item={item} asks={asks} />
        </Panel>
      ) : null}
      {panels.length === 0 ? (
        <Panel className="p-5">
          <EmptyNote icon={BookOpen} sentence="No run has worked this item yet." />
        </Panel>
      ) : (
        panels.map(panel => {
          if (panel.kind === 'stage')
            return <StageStoryPanel key={panel.key} view={view.declaration} panel={panel} />;
          if (panel.kind === 'drain') return <DrainStoryPanel key={panel.key} panel={panel} />;
          return <MergedStoryPanel key={panel.key} view={view.declaration} panel={panel} />;
        })
      )}
    </div>
  );
}

import { useState, type ReactElement } from 'react';
import { BookOpen, GitMerge, Inbox } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyNote } from '../../components/EmptyNote';
import type { FactoryItem } from '../../skills/factory';
import type { EntityView } from '../../store/cache';
import type { StageRead } from '../lib/map-live';
import type { FactoryStage } from '../lib/stage-steps';
import { factoryPath, type FactoryViewListed, type StageTab } from '../lib/views';
import { readFailure } from '../lib/read-failure';
import { ReadFailure } from '../ReadFailure';
import { useFactoryItems } from '../useFactoryItems';
import { ItemsHere } from './StageItems';
import { StageDrilldown } from './StageDrilldown';
import { StageWorkflow } from './StageWorkflow';

type Declaration = FactoryViewListed['declaration'];

const TABS: readonly { key: StageTab; label: string }[] = [
  { key: 'does', label: 'What this stage does' },
  { key: 'items', label: 'Items here now' },
  { key: 'workflow', label: 'The real workflow' },
];

/** The line under a tab saying where what it shows comes from. */
const SOURCE = 'text-console-13 text-text-tertiary';

/**
 * One stage opened, as the Overview's modal and the stage page both show it: its label and
 * blurb, then three tabs. "What this stage does" is the view file's summary, "Items here now"
 * what sits in it, and "The real workflow" the step graph of each workflow behind it. It opens
 * on the summary when the view file gives one, else on the workflow, which is then the most
 * this stage can say about itself. Mount it keyed by stage, so the tab picked on one stage is
 * not on the next.
 */
export function StageView({
  projectId,
  view,
  stage,
  live,
  titleId,
  initialTab,
}: {
  projectId: string;
  view: Declaration;
  stage: FactoryStage;
  /** The stage's items, as the map's chips read them. */
  live: StageRead;
  /** The id its title carries, for the dialog that names itself by it. */
  titleId?: string;
  /** The tab it opens on, when the link that opened it named one. */
  initialTab?: StageTab;
}): ReactElement {
  const items = useFactoryItems(projectId);
  const [tab, setTab] = useState<StageTab>(
    initialTab ?? (stage.drilldown === undefined ? 'workflow' : 'does')
  );
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 id={titleId} className="text-console-17 font-semibold text-text-primary">
          {stage.label}
        </h3>
        <p className="max-w-3xl text-console-14 leading-relaxed text-text-secondary">
          {stage.blurb}
        </p>
      </div>
      <StageTabs active={tab} onSelect={setTab} />
      {tab === 'does' ? (
        <>
          <p className={SOURCE}>The factory's summary of this stage, from its view file.</p>
          {stage.drilldown === undefined ? (
            <EmptyNote
              icon={BookOpen}
              sentence={
                // Point at the real workflow only when there is one to read.
                stage.workflows.length === 0
                  ? 'This stage has no summary and no workflow runs in it. An item arrives here when its change merges.'
                  : 'This stage has no summary. The real workflow shows its steps.'
              }
            />
          ) : (
            <StageDrilldown
              projectId={projectId}
              view={view}
              stage={stage}
              drilldown={stage.drilldown}
              items={items}
            />
          )}
        </>
      ) : tab === 'items' ? (
        <StageItemsTab projectId={projectId} view={view} stage={stage} live={live} items={items} />
      ) : (
        <>
          <p className={SOURCE}>Generated from the pack's workflow files; shows every step.</p>
          {stage.workflows.length === 0 ? (
            <EmptyNote
              icon={GitMerge}
              sentence="No workflow runs in this stage. An item arrives here when its change merges."
            />
          ) : (
            stage.workflows.map(workflow => (
              <StageWorkflow
                key={workflow}
                projectId={projectId}
                view={view}
                stage={stage}
                workflow={workflow}
                items={items}
              />
            ))
          )}
        </>
      )}
    </div>
  );
}

/** The three tabs; the active one takes the accent (owner change of 2026-11-19, point 1). */
function StageTabs({
  active,
  onSelect,
}: {
  active: StageTab;
  onSelect: (tab: StageTab) => void;
}): ReactElement {
  return (
    <div
      role="tablist"
      aria-label="What this stage shows"
      className="flex flex-wrap gap-1 border-b border-border"
    >
      {TABS.map(({ key, label }) => {
        const on = key === active;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(key)}
            className={`relative -mb-px px-3 py-2 text-console-14 transition-colors duration-150 ease-out ${
              on ? 'font-medium text-text-primary' : 'text-text-tertiary hover:text-text-primary'
            }`}
          >
            {label}
            {on ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent-bright"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** "Items here now": the stage's items, rule 6's empty state, or what failed with a Retry. */
function StageItemsTab({
  projectId,
  view,
  stage,
  live,
  items,
}: {
  projectId: string;
  view: Declaration;
  stage: FactoryStage;
  live: StageRead;
  items: EntityView<FactoryItem[]>;
}): ReactElement {
  return (
    <ItemsHere
      projectId={projectId}
      view={view}
      stage={stage}
      live={live}
      resting
      failed={
        <ReadFailure retry={items.refetch}>
          Could not read the items in this stage
          {items.error === undefined ? '.' : `: ${readFailure(items.error)}`}
        </ReadFailure>
      }
      empty={
        <EmptyNote
          icon={Inbox}
          sentence="Nothing is in this stage now."
          link={
            <Link
              to={factoryPath(projectId, '/board')}
              className="text-accent-bright hover:underline"
            >
              See every item on the board
            </Link>
          }
        />
      }
    />
  );
}

import { useMemo, type ReactElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { useLocation, useParams } from 'react-router';
import { YamlPreview } from '../builder/components/YamlPreview';
import type { FactoryWorkflow } from '../skills/factory';
import { readFailed } from './lib/deadline';
import { BackLink } from './BackLink';
import { FactoryFrame } from './FactoryFrame';
import { RunningItemLinks, RunningItemsFailure } from './RunningItems';
import { useFactoryItems } from './useFactoryItems';
import { itemsOnStep } from './lib/items-on-step';
import {
  stagesOfWorkflow,
  stepInStage,
  stepPageFromStage,
  type FactoryStage,
} from './lib/stage-steps';
import { conditionText } from './lib/step-graph';
import { stepLabel } from './lib/step-label';
import { factoryPath, stageModalLink, type FactoryViewListed } from './lib/views';
import { SkeletonGroup, SkeletonLine } from '../components/Skeleton';
import { FactoryLoading } from './FactoryLoading';
import { GraphSkeleton } from './GraphSkeleton';
import { useFactoryWorkflow, WorkflowReadFailure } from './stage/useFactoryWorkflow';

type Declaration = FactoryViewListed['declaration'];
type FactoryStep = FactoryWorkflow['steps'][number];

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];

/** `/console/p/:projectId/factory/steps/:workflow/:node`: what one step runs, and on what. */
export function StepPage(): ReactElement {
  const {
    projectId = '',
    workflow = '',
    node = '',
  } = useParams<{ projectId: string; workflow: string; node: string }>();
  return (
    <FactoryFrame section={null}>
      {view => (
        <div className="flex flex-col gap-6">
          <StepBackLink
            projectId={projectId}
            stages={stagesOfWorkflow(view.declaration.stages, workflow)}
            stepKey={node}
          />
          <div className="flex flex-col gap-1">
            <h3 className="text-console-17 font-semibold text-text-primary">
              {stepLabel(view.declaration, workflow, node)}
            </h3>
            <p className="text-console-13 text-text-tertiary">
              Engine id{' '}
              <code className="break-all font-mono text-text-secondary">
                {workflow} · {node}
              </code>
            </p>
          </div>
          <StepBody
            projectId={projectId}
            view={view.declaration}
            workflow={workflow}
            stepKey={node}
          />
        </div>
      )}
    </FactoryFrame>
  );
}

/**
 * Back to the stage the step was opened from, open over the Overview; on a direct load, the
 * stage that works this step, else the first naming its workflow, else the overview.
 */
function StepBackLink({
  projectId,
  stages,
  stepKey,
}: {
  projectId: string;
  stages: FactoryStage[];
  stepKey: string;
}): ReactElement {
  const fromStage = stepPageFromStage(useLocation().state);
  const stage =
    stages.find(candidate => candidate.id === fromStage) ??
    stages.find(candidate => stepInStage(candidate, stepKey)) ??
    stages[0];
  if (stage === undefined)
    return <BackLink to={factoryPath(projectId)} label="Back to the overview" />;
  // The stage's home is its modal over the Overview. No `stageModal` state: closing it then
  // drops `?stage=` in place, rather than going back to this step page.
  return <BackLink to={stageModalLink(projectId, stage.id).to} label={`Back to ${stage.label}`} />;
}

function StepBody({
  projectId,
  view,
  workflow,
  stepKey,
}: {
  projectId: string;
  view: Declaration;
  workflow: string;
  stepKey: string;
}): ReactElement {
  const { read, failed, retry } = useFactoryWorkflow(projectId, workflow);
  if (read.data === undefined)
    return failed === undefined ? (
      <FactoryLoading read={read}>
        <GraphSkeleton label="Loading the step" />
      </FactoryLoading>
    ) : (
      <WorkflowReadFailure workflow={workflow} error={failed} retry={retry} />
    );
  const step = read.data.steps.find(candidate => candidate.key === stepKey);
  if (step === undefined)
    return (
      <p className="text-console-14 text-text-secondary">
        No step <span className="font-mono">{stepKey}</span> in{' '}
        <span className="font-mono">{workflow}</span>.
      </p>
    );
  return (
    <>
      <Section title="On this step now">
        <OnThisStep projectId={projectId} view={view} workflow={workflow} stepKey={stepKey} />
      </Section>
      <StepFacts
        step={step}
        condition={conditionText(step.whenClauses, key => stepLabel(view, workflow, key))}
      />
      <StepPrompt step={step} />
      <Section title="YAML">
        {step.yaml === null ? (
          <p className="text-console-13 text-text-secondary">{step.yamlError}</p>
        ) : (
          // The whole block, at its own height, with long lines wrapped: a block runs to a
          // hundred lines, and a sideways scrollbar under the last one is out of sight.
          <div className="overflow-hidden rounded-console-12 border border-border [&_pre_code]:whitespace-pre-wrap [&_pre_code]:break-words">
            <YamlPreview yamlText={step.yaml} />
          </div>
        )}
      </Section>
    </>
  );
}

/** The items a run has on this step now: the step's key, or the loop's id between bodies. */
function OnThisStep({
  projectId,
  view,
  workflow,
  stepKey,
}: {
  projectId: string;
  view: Declaration;
  workflow: string;
  stepKey: string;
}): ReactElement {
  const items = useFactoryItems(projectId);
  const onStep = useMemo(
    () => (items.data === undefined ? undefined : itemsOnStep(items.data, workflow).get(stepKey)),
    [items.data, workflow, stepKey]
  );
  // A failed refresh keeps the last list in the cache; it is no longer evidence of what runs.
  const failed = readFailed(items.error);
  if (failed !== undefined) return <RunningItemsFailure error={failed} />;
  // A slow refresh, like a failed one, leaves the last list no evidence: retry and say so.
  if (items.error !== undefined || items.data === undefined)
    return (
      <FactoryLoading read={items}>
        <SkeletonGroup label="Reading which items are on this step">
          <SkeletonLine width="short" />
        </SkeletonGroup>
      </FactoryLoading>
    );
  if (onStep === undefined)
    return <p className="text-console-14 text-text-secondary">No item is on this step now.</p>;
  return <RunningItemLinks view={view} projectId={projectId} items={onStep} />;
}

const KIND_WORDS: Record<FactoryStep['kind'], string> = {
  agent: 'Agent',
  bash: 'Shell command',
  script: 'Script',
  loop: 'Loop',
  approval: 'Approval',
  wait: 'Wait',
  other: 'Other',
};

function StepFacts({
  step,
  condition,
}: {
  step: FactoryStep;
  /** `when:` in words, by the names steps read by; null when the parser gave no comparisons. */
  condition: string | null;
}): ReactElement {
  const runsCode = step.kind === 'bash' || step.kind === 'script';
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-console-14 sm:grid-cols-[max-content_1fr]">
      <Fact term="Kind">
        {KIND_WORDS[step.kind]}
        {step.includedFrom === null ? null : (
          <span className="text-text-tertiary">
            , included from <span className="font-mono">{step.includedFrom}</span>
          </span>
        )}
      </Fact>
      {runsCode || step.model === null ? null : (
        <Fact term="Runs on">
          <span className="font-mono">{step.model.join(', else ')}</span>
        </Fact>
      )}
      {step.when === null ? null : (
        <Fact term="Runs when">
          {condition === null ? (
            // An expression the engine's parser did not take: this page is where engine detail
            // lives, so it shows as written rather than not at all.
            <span className="break-all font-mono text-console-13">{step.when}</span>
          ) : (
            <span title={step.when}>{condition}</span>
          )}
        </Fact>
      )}
    </dl>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }): ReactElement {
  return (
    <>
      <dt className="text-text-tertiary">{term}</dt>
      <dd className="min-w-0 text-text-primary">{children}</dd>
    </>
  );
}

function StepPrompt({ step }: { step: FactoryStep }): ReactElement {
  const title = step.command === null ? 'Prompt' : `Prompt, from command ${step.command}`;
  return (
    <Section title={title}>
      {step.prompt !== null ? (
        <div className="chat-markdown max-w-205 rounded-console-12 border border-border bg-surface px-5 py-4 text-console-13 leading-relaxed text-text-primary">
          <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
            {step.prompt}
          </ReactMarkdown>
        </div>
      ) : step.promptError !== null ? (
        <p className="font-mono text-console-13 text-error">{step.promptError}</p>
      ) : (
        <p className="text-console-14 text-text-secondary">
          {step.kind === 'bash' || step.kind === 'script'
            ? 'This step runs no prompt; its YAML below holds what it runs.'
            : 'This step runs no prompt.'}
        </p>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-console-12 font-medium uppercase tracking-console-label text-text-tertiary">
        {title}
      </h4>
      {children}
    </section>
  );
}

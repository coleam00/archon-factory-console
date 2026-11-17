import type { ReactElement, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { useLocation, useParams } from 'react-router';
import { YamlPreview } from '../builder/components/YamlPreview';
import * as skill from '../skills';
import type { FactoryWorkflow } from '../skills/factory';
import { useEntity } from '../store/cache';
import { K } from '../store/keys';
import { BackLink } from './BackLink';
import { FactoryFrame } from './FactoryFrame';
import {
  stagesOfWorkflow,
  stepInStage,
  stepPageFromStage,
  type FactoryStage,
} from './lib/stage-steps';
import { readFailure } from './lib/read-failure';
import { factoryPath } from './lib/views';

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
        <div className="flex flex-col gap-5">
          <StepBackLink
            projectId={projectId}
            stages={stagesOfWorkflow(view.declaration.stages, workflow)}
            stepKey={node}
          />
          <h3 className="break-all font-mono text-console-15 font-semibold text-text-primary">
            {workflow} · {node}
          </h3>
          <StepBody projectId={projectId} workflow={workflow} stepKey={node} />
        </div>
      )}
    </FactoryFrame>
  );
}

/**
 * Back to the stage the step was opened from; on a direct load, the stage that works this
 * step, else the first naming its workflow, else the overview.
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
  return (
    <BackLink
      to={factoryPath(projectId, `/stages/${encodeURIComponent(stage.id)}`)}
      label={`Back to ${stage.label}`}
    />
  );
}

function StepBody({
  projectId,
  workflow,
  stepKey,
}: {
  projectId: string;
  workflow: string;
  stepKey: string;
}): ReactElement {
  const read = useEntity<FactoryWorkflow>(K.factoryWorkflow(projectId, workflow), () =>
    skill.getFactoryWorkflow({ codebaseId: projectId, workflow })
  );
  if (read.data === undefined)
    return read.error === undefined ? (
      <p className="text-console-12 text-text-tertiary">Loading the step…</p>
    ) : (
      <p className="font-mono text-console-12 text-error">
        Could not load the step: {readFailure(read.error)}
      </p>
    );
  const step = read.data.steps.find(candidate => candidate.key === stepKey);
  if (step === undefined)
    return (
      <p className="text-sm text-text-secondary">
        No step <span className="font-mono">{stepKey}</span> in{' '}
        <span className="font-mono">{workflow}</span>.
      </p>
    );
  return (
    <>
      <StepFacts step={step} />
      <StepPrompt step={step} />
      <Section title="YAML">
        {step.yaml === null ? (
          <p className="text-console-12 text-text-secondary">{step.yamlError}</p>
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

const KIND_WORDS: Record<FactoryStep['kind'], string> = {
  agent: 'Agent',
  bash: 'Shell command',
  script: 'Script',
  loop: 'Loop',
  approval: 'Approval',
  wait: 'Wait',
  other: 'Other',
};

function StepFacts({ step }: { step: FactoryStep }): ReactElement {
  const runsCode = step.kind === 'bash' || step.kind === 'script';
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
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
          <span className="break-all font-mono text-console-12">{step.when}</span>
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
        <p className="font-mono text-console-12 text-error">{step.promptError}</p>
      ) : (
        <p className="text-console-12 text-text-secondary">
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
      <h4 className="text-console-11 font-medium uppercase tracking-wider text-text-tertiary">
        {title}
      </h4>
      {children}
    </section>
  );
}

import { useState, type MouseEvent, type KeyboardEvent, type ReactElement } from 'react';
import { errorDetail } from '../lib/http';
import * as skill from '../skills';
import type { AttentionQueueItem } from '../skills/runs';
import { invalidate } from '../store/cache';
import { K } from '../store/keys';
import type { Run } from '../primitives/run';

type Attention = Extract<NonNullable<Run['attention']>, { kind: 'attention' }>;

/**
 * What the form needs of an attention wait, from the queue's shape: a run's attention is
 * assignable to it (its options only lack the optional `cost`), so both callers share it.
 */
export type AttentionWait = Pick<
  Extract<AttentionQueueItem, { kind: 'attention' }>,
  'form' | 'options' | 'other' | 'recommendation'
>;
type WaitOption = AttentionWait['options'][number];

/** Sends a chosen answer; throws the server's refusal. */
export type SubmitAnswer = (choose: string[], text: string | undefined) => Promise<void>;

/** True for a wait paused before answers existed; only `resume` continues it. */
export function isLegacyAttention(attention: Attention): boolean {
  return attention.occurrence.startsWith('legacy:');
}

/**
 * The reserved option of a wait declared with `other: true` is answered with text. The
 * engine adds it after the declared options, so the flag names it without its id. Read
 * it from the wait's own order, never from the recommended-first display order.
 */
function needsText(wait: AttentionWait, optionId: string, text: string): boolean {
  return wait.other === true && optionId === wait.options.at(-1)?.id && text.trim() === '';
}

function textPlaceholder(wait: AttentionWait): string {
  if (wait.form === 'message') return 'Your answer';
  return wait.other === true ? 'Optional text; required for Other' : 'Optional text';
}

/** The options to show: the recommended one first, the rest in their declared order. */
function displayOrder(wait: AttentionWait): WaitOption[] {
  const recommended = wait.options.find(option => option.id === wait.recommendation?.option);
  if (recommended === undefined) return wait.options;
  return [recommended, ...wait.options.filter(option => option !== recommended)];
}

const optionName = (option: WaitOption): string => option.label ?? option.id;

/**
 * Answer a paused attention wait in its declared form: free text for a message, one
 * option for approval and select, one or more for multi_select. The recommended option
 * comes first and is highlighted with why; every option shows what it does and costs.
 * `submit` sends the answer; a refusal shows in the server's own words.
 */
export function AttentionAnswerForm({
  wait,
  submit,
}: {
  wait: AttentionWait;
  submit: SubmitAnswer;
}): ReactElement {
  const [text, setText] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = async (choose: string[]): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const trimmed = text.trim();
      await submit(choose, trimmed.length > 0 ? trimmed : undefined);
      setText('');
      setChosen([]);
    } catch (e: unknown) {
      setError(errorDetail(e));
    } finally {
      setBusy(false);
    }
  };
  const stopPropagation = (e: MouseEvent | KeyboardEvent): void => {
    e.stopPropagation();
  };
  const button =
    'rounded bg-warning/15 px-2 py-1 text-console-12 font-semibold text-warning hover:bg-warning/25 disabled:opacity-50';
  const ordered = displayOrder(wait);
  const recommendedId = wait.recommendation?.option;

  return (
    <div
      className="mt-2 flex flex-col gap-2 rounded border border-warning/30 bg-warning/[0.06] p-3"
      onClick={stopPropagation}
      onKeyDown={stopPropagation}
    >
      <WaitOptions wait={wait} ordered={ordered} />
      {wait.form === 'multi_select' ? (
        <div className="flex flex-wrap gap-3 text-console-12">
          {ordered.map(option => (
            <label key={option.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={chosen.includes(option.id)}
                onChange={event => {
                  setChosen(
                    event.target.checked
                      ? [...chosen, option.id]
                      : chosen.filter(id => id !== option.id)
                  );
                }}
              />
              {optionName(option)}
            </label>
          ))}
        </div>
      ) : null}
      <textarea
        value={text}
        onChange={event => {
          setText(event.target.value);
        }}
        placeholder={textPlaceholder(wait)}
        rows={2}
        className="rounded border border-border bg-surface px-2 py-1 text-console-12 text-text-primary"
      />
      <div className="flex flex-wrap items-center gap-2">
        {wait.form === 'message' || wait.form === 'multi_select' ? (
          <button
            type="button"
            disabled={busy || (wait.form === 'multi_select' && chosen.length === 0)}
            onClick={() => void answer(chosen)}
            className={button}
          >
            {busy ? 'Answering…' : 'Answer'}
          </button>
        ) : (
          ordered.map(option => (
            <button
              key={option.id}
              type="button"
              disabled={busy || needsText(wait, option.id, text)}
              onClick={() => void answer([option.id])}
              className={recommendedId === option.id ? `${button} ring-1 ring-warning` : button}
            >
              {`${optionName(option)}${recommendedId === option.id ? ' (recommended)' : ''}`}
            </button>
          ))
        )}
        {error !== null ? (
          <span role="alert" className="text-console-12 text-error">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** The recommendation, highlighted with why, then every other option that says what it does or costs. */
function WaitOptions({
  wait,
  ordered,
}: {
  wait: AttentionWait;
  ordered: WaitOption[];
}): ReactElement | null {
  const { recommendation } = wait;
  const recommended = ordered.find(option => option.id === recommendation?.option);
  const others = ordered.filter(
    option => option !== recommended && (option.does !== undefined || option.cost !== undefined)
  );
  if (recommendation === undefined && others.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {recommendation !== undefined ? (
        <div className="flex flex-col gap-0.5 rounded border border-warning/50 bg-warning/10 px-2.5 py-2 text-console-12">
          <p className="text-text-primary">
            <span className="font-semibold">
              Recommended:{' '}
              {recommended === undefined ? recommendation.option : optionName(recommended)}
            </span>
            {recommendation.confidence !== undefined
              ? ` (${recommendation.confidence} confidence)`
              : ''}
            . {recommendation.why}
          </p>
          {recommended === undefined ? null : <OptionEffects option={recommended} />}
        </div>
      ) : null}
      {others.length > 0 ? (
        <ul className="flex flex-col gap-1 text-console-12 text-text-secondary">
          {others.map(option => (
            <li key={option.id}>
              <span className="font-semibold text-text-primary">{optionName(option)}</span>
              <OptionEffects option={option} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function OptionEffects({ option }: { option: WaitOption }): ReactElement {
  return (
    <span className="block text-text-secondary">
      {option.does ?? ''}
      {option.cost !== undefined ? (
        <span className="block text-text-tertiary">Cost: {option.cost}</span>
      ) : null}
    </span>
  );
}

/**
 * A run's paused attention wait, answered at the occurrence the run reports, so the server
 * refuses the answer if the run has moved on.
 */
export function AttentionAnswerPanel({
  run,
  attention,
}: {
  run: Run;
  attention: Attention;
}): ReactElement | null {
  if (isLegacyAttention(attention)) return null;
  const submit: SubmitAnswer = async (choose, text) => {
    if (!run.id.startsWith('demo-')) {
      await skill.answerRun(run.id, attention.occurrence, choose, text);
    }
    invalidate('runs');
    invalidate(K.run(run.id));
  };
  return <AttentionAnswerForm wait={attention} submit={submit} />;
}

/**
 * A run's outcome as a person reads it: the one place the map's stage modal, the board's cards,
 * its Table and its Set aside strip take an outcome's display words from. The view file's
 * outcome label (`workflow:outcome`, then `workflow:*`); the raw outcome value stays a key and
 * a data attribute, never the words on screen (DESIGN.md, Visual standard: plain words, never
 * raw enum values).
 */
import type { FactoryView } from '../api';
import { stageWords } from './stage-words';

/** The view file's outcome labels by `workflow:outcome` key; an entry with no label is left out. */
export function outcomeLabelsOf(
  view: Pick<FactoryView, 'outcomes'> | null | undefined
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(view?.outcomes ?? {}).flatMap(([key, outcome]) =>
      outcome.label === undefined ? [] : [[key, outcome.label]]
    )
  );
}

/** The outcome's label, by `workflow:outcome` and then `workflow:*`, or undefined when the file gives none. */
export function outcomeLabel(
  labels: Readonly<Record<string, string>>,
  workflow: string,
  outcome: string | null
): string | undefined {
  return (
    (outcome === null ? undefined : labels[`${workflow}:${outcome}`]) ?? labels[`${workflow}:*`]
  );
}

/**
 * The outcome's words: its label, else the outcome value as words (`send-back` reads "Send
 * back"), as `stageWords` words a stage. `workflow` null (a run no pack places) skips the
 * lookup. An in-flow outcome the file does not word is already an error from `check:factory-view`.
 */
export function outcomeWords(
  labels: Readonly<Record<string, string>>,
  workflow: string | null,
  outcome: string
): string {
  return (
    (workflow === null ? undefined : outcomeLabel(labels, workflow, outcome)) ?? stageWords(outcome)
  );
}

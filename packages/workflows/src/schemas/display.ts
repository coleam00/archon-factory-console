/**
 * The words a person reads for a workflow, a node and an outcome, authored where each is
 * named (`display:`). The engine validates and serves them (the pack graph) and runs nothing
 * differently for them: a workflow without `display:` behaves exactly as one with it.
 *
 * Every level is strict, so a misspelt key fails the load instead of silently showing no
 * words: the reason the words live beside the names is that drift is caught where it starts.
 */
import { z } from 'zod';

const labelSchema = z.string().trim().min(1).max(80);
const sentenceSchema = z.string().trim().min(1).max(160);

/**
 * What a run that ended with this outcome did, in one sentence. The two-sentence form tells
 * a run whose item has a proposed change from one whose item has none yet.
 */
export const outcomeStorySchema = z.union([
  sentenceSchema,
  z.strictObject({ withChange: sentenceSchema, withoutChange: sentenceSchema }),
]);

export const outcomeDisplaySchema = z.strictObject({
  label: labelSchema.optional(),
  story: outcomeStorySchema.optional(),
});
export type OutcomeDisplay = z.infer<typeof outcomeDisplaySchema>;

/** A node's name for a person, and an optional longer line saying what it does. */
export const nodeDisplaySchema = z.strictObject({
  label: labelSchema,
  text: sentenceSchema.optional(),
});
export type NodeDisplay = z.infer<typeof nodeDisplaySchema>;

/** A workflow's words without its outcomes': what the pack graph serves on a stage. */
export const workflowWordsSchema = z.strictObject({
  label: labelSchema,
  short: z.string().trim().min(1).max(24).optional(),
  blurb: z.string().trim().min(1).max(300).optional(),
});

/**
 * A workflow's `display:`. `outcomes` is keyed by the values the workflow's declared outcome
 * (`returns.outcome`) can take; the loader refuses any other key.
 */
export const workflowDisplaySchema = z.strictObject({
  ...workflowWordsSchema.shape,
  outcomes: z.record(z.string().min(1), outcomeDisplaySchema).optional(),
});
export type WorkflowDisplay = z.infer<typeof workflowDisplaySchema>;

/** A workflow's words without its outcomes', as the pack graph serves them on its stage. */
export function workflowWords(display: WorkflowDisplay | undefined): {
  display?: z.infer<typeof workflowWordsSchema>;
} {
  if (display === undefined) return {};
  const { outcomes: _outcomes, ...words } = display;
  return { display: words };
}

/** The words `display.outcomes` gives one outcome value, as the pack graph serves them. */
export function outcomeWords(
  display: WorkflowDisplay | undefined,
  value: string
): { display?: OutcomeDisplay } {
  const words = display?.outcomes?.[value];
  return words === undefined ? {} : { display: words };
}

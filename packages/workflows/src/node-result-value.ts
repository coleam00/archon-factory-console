import type { JsonValue } from './output-ref';

/**
 * A completed node's value, the one rule both its run's result and a reader of its record go
 * by: its structured output when it recorded one, else its text output parsed as JSON.
 * Undefined when it has neither, or its text is not JSON: such output has no value to point
 * into.
 */
export function nodeResultValue(structured: unknown, text: unknown): JsonValue | undefined {
  if (structured !== undefined) return structured as JsonValue;
  if (typeof text !== 'string') return undefined;
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return undefined;
  }
}

/**
 * The captured responses predate `shadows` on an item's progress and on each run of an item
 * read: the server sends an empty list where no shadow step decided anything, so a captured
 * response without the field reads as one. A test of shadows adds its decisions itself.
 */
export function withShadowsField<T>(json: T): T {
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const progress = ['title', 'running', 'round', 'returned', 'runs'].every(key => key in record);
    const runFacts = ['runId', 'costUsd', 'step', 'rounds'].every(key => key in record);
    if ((progress || runFacts) && !('shadows' in record)) record.shadows = [];
    for (const entry of Object.values(record)) walk(entry);
  };
  walk(json);
  return json;
}

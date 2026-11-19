/**
 * The captured responses predate two fields the server now always sends. `shadows`, on an
 * item's progress and on each run of an item read: an empty list where no shadow step decided
 * anything. `parked`, on an item's progress: null where the item is not parked. A captured
 * response without them reads as those values. A test of either adds its own value.
 */
export function withLaterFields<T>(json: T): T {
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
    if (progress && !('parked' in record)) record.parked = null;
    for (const entry of Object.values(record)) walk(entry);
  };
  walk(json);
  return json;
}

/**
 * The captured responses predate fields the server now always sends. `shadows`, on an
 * item's progress and on each run of an item read: an empty list where no shadow step decided
 * anything. `parked`, on an item's progress: null where the item is not parked. On each run of
 * an item read, its story facts: `change` and `said` null, `models` and `steps` empty (a run
 * that named no change, said nothing, and whose step starts were not captured). A captured
 * response without them reads as those values. A test of any adds its own value.
 */
/** Each run's story facts, as a run that recorded none of them reads. */
const STORY_FACTS: Record<string, () => unknown> = {
  change: () => null,
  said: () => null,
  models: () => [],
  steps: () => [],
};

function fillStoryFacts(record: Record<string, unknown>): void {
  for (const [key, empty] of Object.entries(STORY_FACTS))
    if (!(key in record)) record[key] = empty();
}

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
    if (runFacts) fillStoryFacts(record);
    for (const entry of Object.values(record)) walk(entry);
  };
  walk(json);
  return json;
}

/**
 * How a person reads an item key. Pack revisions key an issue's item `issue-<number>` or just
 * `<number>`; both read `#<number>`, so one issue has one spelling on every surface.
 *
 * Display only: the key itself is persisted and is the item's route segment, so links,
 * lookups, search and comparisons keep the raw key.
 */

/** The issue number a key names (`issue-123` or `123`, digits as written); null for any other key. */
export function issueNumber(key: string): string | null {
  const match = /^(?:issue-)?(\d+)$/.exec(key);
  return match === null ? null : (match[1] ?? null);
}

/** `#123` for `issue-123` or `123`; any other key as it is. */
export function displayItemKey(key: string): string {
  const number = issueNumber(key);
  return number === null ? key : `#${number}`;
}

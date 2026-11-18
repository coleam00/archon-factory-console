/**
 * Each colour group's look and words, one record for every place that draws a group: the
 * board's column headers, the map's cards and the map's legend. Keyed by `ColumnTone`, the
 * stage groups the schema declares plus the merged column's own, so a group the schema gains
 * fails type-check here until it has a colour. The colours avoid the status colours the chips
 * use (running, needs you); the merged column takes the done colour (Visual standard, rule 5).
 */
import { GitMerge, GitPullRequest, Inbox, type LucideIcon, SearchCode, Wrench } from 'lucide-react';
import type { ColumnTone } from './lib/board-columns';

export interface Tone {
  color: string;
  /** The card's kind label, in the Label role. */
  kind: string;
  /** What the legend says the colour means. */
  words: string;
  Icon: LucideIcon;
}

export const TONES: Record<ColumnTone, Tone> = {
  intake: { color: 'var(--node-prompt)', kind: 'Intake', words: 'Taking work in', Icon: Inbox },
  build: { color: 'var(--node-wait)', kind: 'Build', words: 'Building the change', Icon: Wrench },
  check: {
    color: 'var(--node-approval)',
    kind: 'Check',
    words: 'Checking it',
    Icon: SearchCode,
  },
  land: { color: 'var(--node-script)', kind: 'Merge', words: 'Merging it', Icon: GitPullRequest },
  merged: { color: 'var(--success)', kind: 'Merged', words: 'Merged', Icon: GitMerge },
};

/** A column's or card's colour (rule 5). */
export const toneColor = (tone: ColumnTone): string => TONES[tone].color;

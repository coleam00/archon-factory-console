import type { ReactElement } from 'react';
import type { FactoryStage } from '../lib/stage-steps';

/**
 * Each colour group's colour and its plain words. Keyed by the generated group enum, so a
 * group the schema gains fails type-check here until it has a colour. The colours avoid the
 * status colours the chips use (running, needs you) and the done colour.
 */
export const GROUPS: Record<FactoryStage['group'], { color: string; words: string }> = {
  intake: { color: 'var(--node-prompt)', words: 'Taking work in' },
  build: { color: 'var(--node-wait)', words: 'Building the change' },
  check: { color: 'var(--node-approval)', words: 'Checking it' },
  land: { color: 'var(--node-script)', words: 'Landing it' },
};

/** The colour groups the map draws, named in plain words, in the order work reaches them. */
export function MapLegend({ stages }: { stages: readonly FactoryStage[] }): ReactElement {
  const shown = new Set(stages.map(stage => stage.group));
  const groups = (Object.keys(GROUPS) as FactoryStage['group'][]).filter(group => shown.has(group));
  return (
    <ul aria-label="Colour groups" className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {groups.map(group => (
        <li key={group} className="flex items-center gap-1.5 text-console-12 text-text-secondary">
          <span
            aria-hidden="true"
            className="inline-block size-2.5 rounded-sm"
            style={{ background: GROUPS[group].color }}
          />
          {GROUPS[group].words}
        </li>
      ))}
    </ul>
  );
}

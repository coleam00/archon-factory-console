import type { ReactElement } from 'react';
import type { GraphArrowStyle } from '../lib/map-graph';
import type { FactoryStage } from '../lib/stage-steps';
import { ARROW_STROKE } from './MapArrows';

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

/** What each line on the map means, in plain words. */
const LINES: { style: GraphArrowStyle; words: string }[] = [
  { style: 'solid', words: 'Hands the item on' },
  { style: 'declared', words: 'The pack declares it; this install does not start it' },
  { style: 'problem', words: 'This install refuses to start it' },
];

const ITEM = 'flex items-center gap-1.5 text-console-12 text-text-secondary';

function LineSwatch({ style }: { style: GraphArrowStyle }): ReactElement {
  return (
    <svg aria-hidden="true" width="22" height="8" className="shrink-0">
      <line
        x1="1"
        y1="4"
        x2="21"
        y2="4"
        stroke={ARROW_STROKE[style].stroke}
        strokeWidth={1.5}
        strokeDasharray={ARROW_STROKE[style].dash}
      />
    </svg>
  );
}

/**
 * The colour groups the map draws, named in plain words in the order work reaches them, and
 * what its lines mean: a hand-off, one only declared, one refused, and an end.
 */
export function MapLegend({ stages }: { stages: readonly FactoryStage[] }): ReactElement {
  const shown = new Set(stages.map(stage => stage.group));
  const groups = (Object.keys(GROUPS) as FactoryStage['group'][]).filter(group => shown.has(group));
  return (
    <div className="flex flex-col gap-1">
      <ul aria-label="Colour groups" className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {groups.map(group => (
          <li key={group} className={ITEM}>
            <span
              aria-hidden="true"
              className="inline-block size-2.5 rounded-sm"
              style={{ background: GROUPS[group].color }}
            />
            {GROUPS[group].words}
          </li>
        ))}
      </ul>
      <ul aria-label="Lines" className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {LINES.map(line => (
          <li key={line.style} className={ITEM}>
            <LineSwatch style={line.style} />
            {line.words}
          </li>
        ))}
        <li className={ITEM}>
          <svg aria-hidden="true" width="22" height="8" className="shrink-0">
            <path
              d="M1,4 H17 M17,0 V8"
              fill="none"
              stroke={ARROW_STROKE.solid.stroke}
              strokeWidth={1.5}
            />
          </svg>
          Ends here: these outcomes start nothing
        </li>
      </ul>
    </div>
  );
}

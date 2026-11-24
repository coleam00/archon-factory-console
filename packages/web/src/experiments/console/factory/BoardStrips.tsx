import { useState, type ReactElement } from 'react';
import type { ItemName } from '../lib/ask-naming';
import { FoundByTheFactory, FoundByTheFactoryLine } from './FoundByTheFactory';
import type { SetAside } from './lib/set-aside';
import { SetAsideLine, SetAsideList } from './SetAsideStrip';

const OPENED_ID = 'board-strips-open';

/**
 * Whether the strips under the board are open. `arrived` (the board was opened on
 * `?show=found`) opens them and asks the findings to scroll into view; the first toggle ends
 * that, so a person closing and reopening them is not scrolled away from the board. It lives
 * above the Pipeline/Table switch, so a switch leaves the strips as they were.
 */
export function useBoardStrips(arrived: boolean): {
  open: boolean;
  /** Scroll the findings into view when they draw: the board was opened on them. */
  arriving: boolean;
  toggle: () => void;
} {
  const [state, setState] = useState<'closed' | 'open' | 'arrived'>(arrived ? 'arrived' : 'closed');
  return {
    open: state !== 'closed',
    arriving: state === 'arrived',
    toggle: () => {
      setState(current => (current === 'closed' ? 'open' : 'closed'));
    },
  };
}

interface StripsProps {
  projectId: string;
  /** The view declares `discoveries`: "Found by the factory" is one of the strips. */
  discoveries: boolean;
  setAside: readonly SetAside[];
}

/**
 * One line under the board: "Found by the factory" and "N set aside" side by side, and one
 * toggle opening both below the board ({@link BoardStripsOpened}). Nothing when neither strip
 * has anything to say.
 */
export function BoardStripsLine({
  discoveries,
  setAside,
  projectId,
  open,
  onToggle,
}: StripsProps & { open: boolean; onToggle: () => void }): ReactElement | null {
  if (!discoveries && setAside.length === 0) return null;
  return (
    <div
      data-board-strips
      className="flex shrink-0 flex-col gap-2 md:flex-row md:items-center md:gap-3"
    >
      {discoveries ? (
        <div className="min-w-0 md:flex-1">
          <FoundByTheFactoryLine projectId={projectId} />
        </div>
      ) : null}
      {setAside.length === 0 ? null : (
        <div className="min-w-0 md:flex-1">
          <SetAsideLine count={setAside.length} />
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={OPENED_ID}
        onClick={onToggle}
        className="shrink-0 self-start text-console-13 text-accent transition-colors duration-150 ease-out hover:text-text-primary md:self-center"
      >
        {open ? 'hide them' : 'show them'}
      </button>
    </div>
  );
}

/**
 * The strips opened: the findings and the set-aside list, in the page below the board or
 * table, never over it. The board keeps its height; the page scrolls to them.
 */
export function BoardStripsOpened({
  projectId,
  discoveries,
  setAside,
  names,
  arriving,
}: StripsProps & {
  names: ReadonlyMap<string, ItemName>;
  /** Scroll the findings into view: the board was opened on them and has drawn its columns. */
  arriving: boolean;
}): ReactElement | null {
  if (!discoveries && setAside.length === 0) return null;
  return (
    <div
      id={OPENED_ID}
      data-board-strips-open
      className="flex shrink-0 flex-col gap-3 md:flex-row md:items-start md:pb-4"
    >
      {discoveries ? (
        <div className="min-w-0 md:flex-1">
          <FoundByTheFactory projectId={projectId} names={names} opened={arriving} />
        </div>
      ) : null}
      {setAside.length === 0 ? null : (
        <div className="min-w-0 md:flex-1">
          <SetAsideList projectId={projectId} entries={setAside} />
        </div>
      )}
    </div>
  );
}

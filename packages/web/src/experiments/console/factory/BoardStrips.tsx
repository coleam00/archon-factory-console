import { useState, type ReactElement } from 'react';
import type { SetAside } from './lib/set-aside';
import { SetAsideLine, SetAsideList } from './SetAsideStrip';

const OPENED_ID = 'board-strips-open';

/**
 * Whether the strips under the board are open. It lives above the Pipeline/Table switch, so a
 * switch leaves the strips as they were.
 */
export function useBoardStrips(): { open: boolean; toggle: () => void } {
  const [open, setOpen] = useState(false);
  return {
    open,
    toggle: () => {
      setOpen(current => !current);
    },
  };
}

interface StripsProps {
  setAside: readonly SetAside[];
}

/**
 * One line under the board: "N set aside", and one toggle opening the list below the board
 * ({@link BoardStripsOpened}). Nothing when nothing is set aside.
 */
export function BoardStripsLine({
  setAside,
  open,
  onToggle,
}: StripsProps & { open: boolean; onToggle: () => void }): ReactElement | null {
  if (setAside.length === 0) return null;
  return (
    <div
      data-board-strips
      className="flex shrink-0 scroll-mt-6 flex-col gap-2 md:flex-row md:items-center md:gap-3"
    >
      <div className="min-w-0 md:flex-1">
        <SetAsideLine count={setAside.length} />
      </div>
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
 * The strip opened: the set-aside list, in the page below the board or table, never over it.
 * The board keeps its height; the page scrolls to it.
 */
export function BoardStripsOpened({
  projectId,
  setAside,
}: StripsProps & { projectId: string }): ReactElement | null {
  if (setAside.length === 0) return null;
  return (
    <div
      id={OPENED_ID}
      data-board-strips-open
      className="flex shrink-0 flex-col gap-3 md:flex-row md:items-start md:pb-4"
    >
      <div className="min-w-0 md:flex-1">
        <SetAsideList projectId={projectId} entries={setAside} />
      </div>
    </div>
  );
}

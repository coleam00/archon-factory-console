import { useEffect, useId, useRef, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { stageReadOf, type MapLive, type Unread } from '../lib/map-live';
import type { FactoryViewListed, StageModalLink } from '../lib/views';
import { StageView } from '../stage/StageView';

/**
 * The stage `?stage=<id>` names, opened as a large modal over the Overview (owner change of
 * 2026-11-19, point 5). The Overview stays mounted under it, so the page keeps its scroll and
 * the map its pan and zoom. Esc, the close button and a press on the backdrop close it, and so
 * does Back: a map link pushed the entry (`stageModalLink`), and closing goes back to the
 * entry before it. A modal opened from a pasted link has no entry of ours before it, so closing
 * that one drops `stage` from the URL in place. Mounted beside the map's frame, never inside
 * it: React events bubble through a portal along the component tree, and the frame pans on a
 * pointer drag.
 */
export function StageModal({
  projectId,
  view,
  live,
}: {
  projectId: string;
  view: FactoryViewListed['declaration'];
  /** The map's own live read, so the modal's items and the card's chips agree. */
  live: MapLive | Unread;
}): ReactElement | null {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const titleId = useId();
  const stageId = params.get('stage');
  if (stageId === null) return null;
  const pushed = (location.state as Partial<StageModalLink['state']> | null)?.stageModal === true;
  const close = (): void => {
    if (pushed) {
      void navigate(-1);
      return;
    }
    setParams(
      current => {
        const next = new URLSearchParams(current);
        next.delete('stage');
        return next;
      },
      { replace: true }
    );
  };
  const stage = view.stages.find(candidate => candidate.id === stageId);
  return (
    <ModalShell titleId={titleId} close={close}>
      {stage === undefined ? (
        <div className="flex flex-col gap-2">
          <h3 id={titleId} className="text-console-17 font-semibold text-text-primary">
            No such stage
          </h3>
          <p className="text-console-14 text-text-secondary">
            This factory has no stage <span className="font-mono">{stageId}</span>.
          </p>
        </div>
      ) : (
        <StageView
          key={stage.id}
          projectId={projectId}
          view={view}
          stage={stage}
          live={stageReadOf(live, stage.id)}
          titleId={titleId}
        />
      )}
    </ModalShell>
  );
}

/** What Tab can reach inside the panel. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The dialog: a backdrop and a panel, portalled to the body (it carries `console-root` itself,
 * as the body is outside the console's theme). From md up the panel sits 40 px inside the
 * window; under md it is the whole screen. Its body scrolls on its own, and `overscroll-contain`
 * keeps a scroll that reaches its end from scrolling the Overview under it.
 */
function ModalShell({
  titleId,
  close,
  children,
}: {
  titleId: string;
  close: () => void;
  children: ReactNode;
}): ReactElement {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const opener =
      document.activeElement instanceof window.HTMLElement ? document.activeElement : null;
    closeButton.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        // Captured on the window and stopped, so the map's own Esc (which closes its details
        // panel, and with it moves the camera) never sees it.
        event.stopPropagation();
        event.preventDefault();
        closeRef.current();
      } else if (event.key === 'Tab' && panel.current !== null) {
        keepTabInside(event, panel.current);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return (): void => {
      window.removeEventListener('keydown', onKey, true);
      opener?.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div className="console-root fixed inset-0 z-50 text-text-primary">
      <div
        data-backdrop=""
        aria-hidden="true"
        onMouseDown={close}
        className="absolute inset-0 bg-black/60"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-0 flex flex-col overflow-hidden bg-surface md:inset-10 md:rounded-console-12 md:border md:border-border md:shadow-2xl"
      >
        <button
          ref={closeButton}
          type="button"
          aria-label="Close"
          onClick={close}
          className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-text-tertiary transition-colors duration-150 ease-out hover:bg-surface-hover hover:text-text-primary"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pr-14 md:p-6 md:pr-16">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Tab from the last focusable element of `panel` goes to its first, Shift+Tab the other way. */
function keepTabInside(event: KeyboardEvent, panel: HTMLElement): void {
  const reachable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const first = reachable[0];
  const last = reachable.at(-1);
  if (first === undefined || last === undefined) return;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !panel.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

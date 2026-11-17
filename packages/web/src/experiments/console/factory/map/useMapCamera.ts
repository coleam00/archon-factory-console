import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import {
  fitCamera,
  fittedHeight,
  MIN_FRAME_HEIGHT,
  reveal,
  zoomAt,
  type Camera,
  type Frame,
} from '../lib/map-camera';
import type { Box } from '../lib/map-layout';

/** A press that moves less than this (px, summed axes) is a click, not a pan. */
const DRAG_SLOP = 4;
const BUTTON_ZOOM = 1.25;

export interface MapCamera {
  frameRef: RefObject<HTMLDivElement | null>;
  camera: Camera;
  /** The frame's height: the map fitted to the width of the row the frame sits in. */
  height: number;
  zoomIn: () => void;
  zoomOut: () => void;
  /** The whole map in the frame; it then refits with the frame again until moved. */
  fit: () => void;
  frameHandlers: {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLElement>) => void;
    onPointerUp: () => void;
    onClickCapture: (event: MouseEvent<HTMLElement>) => void;
  };
}

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
}

const frameOf = (el: HTMLElement): Frame => ({ width: el.clientWidth, height: el.clientHeight });

/**
 * The map's camera, ported from Mission Control's map: it opens fitted and refits as the frame
 * resizes (the details panel opening beside it, too) until the person pans or zooms, so every
 * card stays in reach; a drag pans, the wheel zooms around the cursor. Once moved, the camera
 * stays where the person put it, panning only as far as it must to keep the `focus`ed card
 * (the one whose details are open) in view.
 */
export function useMapCamera(bounds: Box, focus: Box | null): MapCamera {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, k: 1 });
  const [height, setHeight] = useState(MIN_FRAME_HEIGHT);
  const current = useRef(camera);
  const moved = useRef(false);
  const focused = useRef(focus);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);

  const put = useCallback((next: Camera) => {
    current.current = next;
    setCamera(next);
  }, []);

  const place = useCallback(() => {
    const el = frameRef.current;
    if (el === null) return;
    const row = el.parentElement ?? el;
    setHeight(fittedHeight(bounds, row.clientWidth));
    const target = focused.current;
    if (!moved.current) put(fitCamera(bounds, frameOf(el)));
    else if (target !== null) put(reveal(current.current, target, frameOf(el)));
  }, [bounds, put]);

  useEffect(() => {
    focused.current = focus;
    place();
  }, [focus, place]);

  useEffect(() => {
    const el = frameRef.current;
    // happy-dom and old browsers have no ResizeObserver; the map then stays where it opened.
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => place());
    observer.observe(el);
    if (el.parentElement !== null) observer.observe(el.parentElement);
    return () => observer.disconnect();
  }, [place]);

  const zoomAround = useCallback(
    (factor: number, at: { x: number; y: number }) => {
      moved.current = true;
      put(zoomAt(current.current, at, factor));
    },
    [put]
  );

  // React attaches wheel listeners passive, and a passive one cannot keep the page still.
  useEffect(() => {
    const el = frameRef.current;
    if (el === null) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const box = el.getBoundingClientRect();
      zoomAround(Math.exp(-event.deltaY * 0.0022), {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAround]);

  const zoomCentre = (factor: number): void => {
    const el = frameRef.current;
    if (el !== null) zoomAround(factor, { x: el.clientWidth / 2, y: el.clientHeight / 2 });
  };

  const fit = (): void => {
    const el = frameRef.current;
    if (el === null) return;
    moved.current = false;
    put(fitCamera(bounds, frameOf(el)));
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>): void => {
    if (event.button !== 0) return;
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
  };
  // Capture waits for the press to move: captured at once, a plain click on a card would go
  // to the frame instead.
  const onPointerMove = (event: PointerEvent<HTMLElement>): void => {
    const was = drag.current;
    if (was === null) return;
    // A press released outside the frame before it was captured never reaches onPointerUp.
    if (event.buttons === 0) {
      drag.current = null;
      return;
    }
    if (!was.moved) {
      if (Math.abs(event.clientX - was.startX) + Math.abs(event.clientY - was.startY) <= DRAG_SLOP)
        return;
      was.moved = true;
      event.currentTarget.setPointerCapture(was.pointerId);
    }
    moved.current = true;
    const at = current.current;
    put({ ...at, x: at.x + event.clientX - was.lastX, y: at.y + event.clientY - was.lastY });
    was.lastX = event.clientX;
    was.lastY = event.clientY;
  };
  const onPointerUp = (): void => {
    const was = drag.current;
    drag.current = null;
    if (was?.moved !== true) return;
    // The click a browser sends after a drag must not select the card the drag ended on. It
    // comes straight after this event or not at all, so the guard lasts one task.
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  };
  const onClickCapture = (event: MouseEvent<HTMLElement>): void => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.stopPropagation();
    event.preventDefault();
  };

  return {
    frameRef,
    camera,
    height,
    zoomIn: () => zoomCentre(BUTTON_ZOOM),
    zoomOut: () => zoomCentre(1 / BUTTON_ZOOM),
    fit,
    frameHandlers: { onPointerDown, onPointerMove, onPointerUp, onClickCapture },
  };
}

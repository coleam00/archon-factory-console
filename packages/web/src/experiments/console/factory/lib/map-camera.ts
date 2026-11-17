/**
 * The factory map's camera: the world drawn at `translate(x, y) scale(k)` with origin 0 0,
 * so a world point p sits at `p * k + (x, y)` in the frame.
 */
import type { Box, Point } from './map-layout';

export interface Camera {
  x: number;
  y: number;
  k: number;
}

export interface Frame {
  width: number;
  height: number;
}

export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 2;
/** Fitting never enlarges the map past its drawn size: zoom in to read closer. */
const MAX_FIT = 1;
/**
 * The smallest text the map draws, in world px (cards, chips and arrow labels are
 * `text-console-15`; FactoryMap.test.tsx holds the classes to it), and the console's type
 * floor, its smallest text token (`--text-console-9`).
 */
export const MAP_TEXT_PX = 15;
export const TYPE_FLOOR_PX = 9;
/**
 * The least scale fitting opens at, so the map's text never draws under the type floor. A
 * frame too narrow for the whole map at this scale shows its start and pans to the rest.
 */
export const READABLE_K = TYPE_FLOOR_PX / MAP_TEXT_PX;
/** Space kept between the fitted map and the frame's edge. */
export const FIT_PAD = 24;
/** The frame is never shorter than this, so the details panel beside it has room. */
export const MIN_FRAME_HEIGHT = 260;

export function clampK(k: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
}

/**
 * The scale that fits `bounds` in `frame`, inside the padding, never under `READABLE_K` nor
 * over the drawn size; 1 for an empty map.
 */
function fitScale(bounds: Box, frame: Frame, pad: number): number {
  const sx = bounds.w > 0 ? (frame.width - 2 * pad) / bounds.w : MAX_FIT;
  const sy = bounds.h > 0 ? (frame.height - 2 * pad) / bounds.h : MAX_FIT;
  return clampK(Math.max(READABLE_K, Math.min(MAX_FIT, sx, sy)));
}

/** Where a span of `size` starts in an `extent`: centred when it fits, else at the padding. */
function place(size: number, extent: number, pad: number): number {
  return size <= extent - 2 * pad ? (extent - size) / 2 : pad;
}

/**
 * The map in the frame at its fitting scale: centred where it fits, else from its start
 * (top-left), so a narrow frame shows the first stages and pans to the rest. Finite for any
 * frame, a zero-sized one included.
 */
export function fitCamera(bounds: Box, frame: Frame, pad = FIT_PAD): Camera {
  const k = fitScale(bounds, frame, pad);
  return {
    k,
    x: place(bounds.w * k, frame.width, pad) - bounds.x * k,
    y: place(bounds.h * k, frame.height, pad) - bounds.y * k,
  };
}

/** The frame height for a frame `width` wide: the map at its fitting scale, no empty bands. */
export function fittedHeight(bounds: Box, width: number, pad = FIT_PAD): number {
  const k = fitScale(bounds, { width, height: Number.POSITIVE_INFINITY }, pad);
  return Math.max(MIN_FRAME_HEIGHT, Math.ceil(bounds.h * k + 2 * pad));
}

/**
 * How many rows the map takes in a row `width` wide (the frame and the details panel beside
 * it): one while the one-row map fits there at the readable scale, else two. A width not
 * measured yet (0) takes one. Below the width that holds two rows the map pans.
 */
export function rowsFor(oneRow: Box, width: number, pad = FIT_PAD): 1 | 2 {
  return width <= 0 || oneRow.w * READABLE_K + 2 * pad <= width ? 1 : 2;
}

/** Zoom by `factor` keeping the frame point `at` over the same world point. */
export function zoomAt(camera: Camera, at: Point, factor: number): Camera {
  const k = clampK(camera.k * factor);
  const r = k / camera.k;
  return { k, x: at.x - (at.x - camera.x) * r, y: at.y - (at.y - camera.y) * r };
}

/** The camera panned the least distance that shows all of `box` in the frame, where it fits. */
export function reveal(camera: Camera, box: Box, frame: Frame, pad = FIT_PAD): Camera {
  const shift = (start: number, size: number, extent: number): number => {
    const lo = pad - start;
    const hi = extent - pad - (start + size);
    if (lo > 0) return lo;
    if (hi < 0) return Math.max(hi, lo);
    return 0;
  };
  const left = box.x * camera.k + camera.x;
  const top = box.y * camera.k + camera.y;
  return {
    ...camera,
    x: camera.x + shift(left, box.w * camera.k, frame.width),
    y: camera.y + shift(top, box.h * camera.k, frame.height),
  };
}

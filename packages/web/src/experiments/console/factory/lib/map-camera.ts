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
/** Space kept between the fitted map and the frame's edge. */
export const FIT_PAD = 24;
/** The frame is never shorter than this, so the details panel beside it has room. */
export const MIN_FRAME_HEIGHT = 260;

export function clampK(k: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
}

/** The scale that fits `bounds` in `frame`, inside the padding; 1 for an empty map. */
function fitScale(bounds: Box, frame: Frame, pad: number): number {
  const sx = bounds.w > 0 ? (frame.width - 2 * pad) / bounds.w : MAX_FIT;
  const sy = bounds.h > 0 ? (frame.height - 2 * pad) / bounds.h : MAX_FIT;
  return clampK(Math.min(MAX_FIT, sx, sy));
}

/** The whole map in the frame, centred. Finite for any frame, a zero-sized one included. */
export function fitCamera(bounds: Box, frame: Frame, pad = FIT_PAD): Camera {
  const k = fitScale(bounds, frame, pad);
  return {
    k,
    x: (frame.width - bounds.w * k) / 2 - bounds.x * k,
    y: (frame.height - bounds.h * k) / 2 - bounds.y * k,
  };
}

/** The frame height for a frame `width` wide: the map fitted to the width, no empty bands. */
export function fittedHeight(bounds: Box, width: number, pad = FIT_PAD): number {
  const k = fitScale(bounds, { width, height: Number.POSITIVE_INFINITY }, pad);
  return Math.max(MIN_FRAME_HEIGHT, Math.ceil(bounds.h * k + 2 * pad));
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

import { describe, expect, test } from 'bun:test';
import {
  clampK,
  fitCamera,
  fittedHeight,
  MAX_ZOOM,
  MIN_FRAME_HEIGHT,
  MIN_ZOOM,
  reveal,
  zoomAt,
} from './map-camera';

const world = { x: 0, y: -10, w: 1000, h: 200 };

describe('the map camera', () => {
  test('fit centres the map in the frame at the largest scale that holds it, inside the padding', () => {
    const camera = fitCamera(world, { width: 548, height: 400 }, 24);
    expect(camera.k).toBe(0.5);
    expect(camera.x).toBe(24);
    // 200 tall at 0.5 is 100, centred in 400; the world starts at y -10.
    expect(camera.y).toBe(150 + 5);
  });

  test('fit never enlarges past the drawn size, nor shrinks below the least zoom', () => {
    expect(fitCamera(world, { width: 5000, height: 5000 }).k).toBe(1);
    expect(fitCamera(world, { width: 60, height: 60 }).k).toBe(MIN_ZOOM);
  });

  test('fit is finite for an empty map and for a frame not laid out yet', () => {
    const empty = fitCamera({ x: 0, y: 0, w: 0, h: 0 }, { width: 800, height: 300 });
    expect(empty).toEqual({ k: 1, x: 400, y: 150 });
    const unsized = fitCamera(world, { width: 0, height: 0 });
    expect([unsized.k, unsized.x, unsized.y].every(Number.isFinite)).toBe(true);
  });

  test('the fitted frame height leaves no empty band, never below the floor', () => {
    expect(fittedHeight({ x: 0, y: 0, w: 1000, h: 600 }, 548, 24)).toBe(348);
    expect(fittedHeight(world, 548, 24)).toBe(MIN_FRAME_HEIGHT);
  });

  test('zoom keeps the point under the cursor over the same world point', () => {
    const camera = { x: 40, y: 20, k: 0.8 };
    const at = { x: 300, y: 120 };
    const worldAt = { x: (at.x - camera.x) / camera.k, y: (at.y - camera.y) / camera.k };
    const zoomed = zoomAt(camera, at, 1.25);
    expect(zoomed.k).toBe(1);
    expect(worldAt.x * zoomed.k + zoomed.x).toBeCloseTo(at.x);
    expect(worldAt.y * zoomed.k + zoomed.y).toBeCloseTo(at.y);
  });

  test('zoom stops at its bounds', () => {
    expect(clampK(10)).toBe(MAX_ZOOM);
    expect(clampK(0)).toBe(MIN_ZOOM);
    expect(zoomAt({ x: 0, y: 0, k: MAX_ZOOM }, { x: 10, y: 10 }, 2)).toEqual({
      x: 0,
      y: 0,
      k: MAX_ZOOM,
    });
  });

  test('reveal pans the least that shows a card, and not at all when it shows', () => {
    const camera = { x: 0, y: 0, k: 1 };
    const frame = { width: 500, height: 300 };
    expect(reveal(camera, { x: 100, y: 50, w: 100, h: 100 }, frame, 20)).toEqual(camera);
    expect(reveal(camera, { x: 450, y: 50, w: 100, h: 100 }, frame, 20)).toEqual({
      ...camera,
      x: -70,
    });
    expect(reveal(camera, { x: -30, y: 50, w: 100, h: 100 }, frame, 20)).toEqual({
      ...camera,
      x: 50,
    });
  });
});

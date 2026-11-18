import { describe, expect, test } from 'bun:test';
import {
  clampK,
  fitCamera,
  fittedHeight,
  MAX_ZOOM,
  MIN_FRAME_HEIGHT,
  FIT_PAD,
  MAP_SMALLEST_PX,
  MIN_ZOOM,
  READABLE_K,
  reveal,
  TYPE_FLOOR_PX,
  zoomAt,
} from './map-camera';
import { busiestCard, layoutMap } from './map-layout';
import { shippedView } from '../item-detail.test-fixtures';

const world = { x: 0, y: -10, w: 1000, h: 200 };

describe('the map camera', () => {
  test('fit centres the map in the frame at the largest scale that holds it, inside the padding', () => {
    const camera = fitCamera(world, { width: 848, height: 400 }, 24, MIN_ZOOM);
    expect(camera.k).toBe(0.8);
    expect(camera.x).toBe(24);
    // 200 tall at 0.8 is 160, centred in 400; the world starts at y -10.
    expect(camera.y).toBe(120 + 8);
  });

  test('fit never enlarges past the drawn size, nor shrinks the text under the type floor', () => {
    expect(fitCamera(world, { width: 5000, height: 5000 }).k).toBe(1);
    expect(fitCamera(world, { width: 60, height: 60 }).k).toBe(READABLE_K);
    expect(READABLE_K).toBeGreaterThan(MIN_ZOOM);
  });

  test('a frame too narrow for the whole map opens on its start, at the readable scale', () => {
    const camera = fitCamera(world, { width: 400, height: 300 }, 24);
    expect(camera.k).toBe(READABLE_K);
    // The world's left edge at the padding: the first stages show, the rest pans.
    expect(camera.x).toBe(24);
  });

  test('the readable scale is 1: the smallest text, 12 px, at the type floor', () => {
    expect(MAP_SMALLEST_PX).toBe(TYPE_FLOOR_PX);
    expect(READABLE_K).toBe(1);
  });

  // The Overview frame's widths on a phone, a tablet, at 1440x900, 1280 and wider.
  const WIDTHS = [320, 390, 768, 1100, 1280, 1600];
  const { bounds, cards } = layoutMap(shippedView);
  const fitWidth = bounds.w + 2 * FIT_PAD;

  test('the shipped map opens at the readable scale at every frame width, panning exactly below its fit width', () => {
    for (const width of WIDTHS) {
      const camera = fitCamera(bounds, { width, height: fittedHeight(bounds, width) });
      expect(camera.k).toBe(READABLE_K);
      const pans = bounds.w * camera.k > width - 2 * FIT_PAD;
      expect(pans).toBe(width < fitWidth);
    }
    const at = (width: number) => fitCamera(bounds, { width, height: 400 });
    // At its fit width it is centred; one pixel narrower it opens on its start and pans.
    expect(at(fitWidth).x).toBe(FIT_PAD - bounds.x);
    expect(at(fitWidth - 1).x).toBe(FIT_PAD - bounds.x);
    expect(at(fitWidth + 100).x).toBe(FIT_PAD + 50 - bounds.x);
  });

  test('a map that pans opens with the busiest card in the frame, within its edges', () => {
    for (const width of WIDTHS.filter(w => w < fitWidth)) {
      for (const card of cards) {
        const camera = fitCamera(bounds, { width, height: 400 }, FIT_PAD, READABLE_K, 1, card.box);
        const left = card.box.x * camera.k + camera.x;
        expect(left).toBeGreaterThanOrEqual(0);
        expect(left + card.box.w * camera.k).toBeLessThanOrEqual(width);
        // The drawing's edges never leave the padding.
        expect(bounds.x * camera.k + camera.x).toBeLessThanOrEqual(FIT_PAD);
        expect((bounds.x + bounds.w) * camera.k + camera.x).toBeGreaterThanOrEqual(width - FIT_PAD);
      }
    }
  });

  test('the opening card is the busiest, the leftmost on a tie; none in flight opens on the start', () => {
    const width = 390;
    const open = (counts: Record<string, number>) =>
      fitCamera(
        bounds,
        { width, height: 400 },
        FIT_PAD,
        READABLE_K,
        1,
        busiestCard(cards, stage => counts[stage] ?? 0, shippedView.landed.stage)?.box
      );
    const centreOf = (id: string, x: number): number => {
      const box = cards.find(card => card.id === id)?.box;
      return (box?.x ?? 0) + (box?.w ?? 0) / 2 + x;
    };
    expect(centreOf('checks-review', open({ checks: 2, build: 1 }).x)).toBe(width / 2);
    expect(centreOf('plan-build', open({ plan: 1, host: 1 }).x)).toBe(width / 2);
    expect(open({}).x).toBe(FIT_PAD - bounds.x);
    expect(open({ landed: 9 }).x).toBe(FIT_PAD - bounds.x);
  });

  test('fit is finite for an empty map and for a frame not laid out yet', () => {
    const empty = fitCamera({ x: 0, y: 0, w: 0, h: 0 }, { width: 800, height: 300 });
    expect(empty).toEqual({ k: 1, x: 400, y: 150 });
    const unsized = fitCamera(world, { width: 0, height: 0 });
    expect([unsized.k, unsized.x, unsized.y].every(Number.isFinite)).toBe(true);
  });

  test('the fitted frame height leaves no empty band, never below the floor', () => {
    expect(fittedHeight({ x: 0, y: 0, w: 1000, h: 600 }, 848, 24, MIN_ZOOM)).toBe(528);
    // Too narrow to fit: the height of the map at the readable scale.
    expect(fittedHeight({ x: 0, y: 0, w: 1000, h: 600 }, 300, 24)).toBe(600 * READABLE_K + 48);
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

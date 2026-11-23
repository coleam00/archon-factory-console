import { describe, expect, test } from 'bun:test';
import { edgeFades, revealTab } from './tab-row';

describe("a tab row's fades", () => {
  test('a row that fits fades neither edge', () => {
    expect(edgeFades({ scrollLeft: 0, scrollWidth: 1440, clientWidth: 1440 })).toEqual({
      start: false,
      end: false,
    });
  });
  test('at its start, it fades the end it hides tabs past', () => {
    expect(edgeFades({ scrollLeft: 0, scrollWidth: 520, clientWidth: 390 })).toEqual({
      start: false,
      end: true,
    });
  });
  test('in the middle, both', () => {
    expect(edgeFades({ scrollLeft: 60, scrollWidth: 520, clientWidth: 390 })).toEqual({
      start: true,
      end: true,
    });
  });
  test('at its end, the start alone', () => {
    expect(edgeFades({ scrollLeft: 130, scrollWidth: 520, clientWidth: 390 })).toEqual({
      start: true,
      end: false,
    });
  });
  test('a pixel of subpixel rounding fades nothing', () => {
    expect(edgeFades({ scrollLeft: 1, scrollWidth: 391, clientWidth: 390 })).toEqual({
      start: false,
      end: false,
    });
  });
});

describe('bringing the active tab into view', () => {
  const row = { scrollLeft: 0, clientWidth: 390 };
  test('a tab in view stays where it is', () => {
    expect(revealTab(row, 100, 80)).toBe(0);
  });
  test('a tab past the end scrolls just far enough to show its right edge', () => {
    expect(revealTab(row, 440, 80)).toBe(130);
  });
  test('a tab before the start scrolls back to its left edge', () => {
    expect(revealTab({ scrollLeft: 130, clientWidth: 390 }, 40, 80)).toBe(40);
  });
});

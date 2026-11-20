import { describe, expect, test } from 'bun:test';
import type { FactoryDrilldown } from './drilldown-live';
import { checksDrilldown } from './fixtures/checks-drilldown';
import { stageModalSize } from './stage-modal-size';
import type { StageTab } from './views';

const DESKTOP = { width: 1440, height: 900 };
const card = checksDrilldown.phases[0]!.cards[0]!;
/** A drill-down of `count` phases of one card each, without a loop. */
const phases = (count: number): FactoryDrilldown => ({
  phases: Array.from({ length: count }, (_, p) => ({
    label: `Phase ${String(p + 1)}`,
    cards: [card],
  })),
});
const width = (
  drilldown: FactoryDrilldown | undefined,
  tab: StageTab = 'does',
  viewport = DESKTOP,
  graphWidth?: number
): number =>
  stageModalSize({ drilldown, tab, graphWidth, naturalHeight: undefined, viewport }).width;

describe('the stage modal is as wide as its phases', () => {
  test('a one-phase stage, like Plan, opens at the compact width', () => {
    expect(width(phases(1))).toBe(640);
  });

  test('a stage with no drill-down opens at the compact width too', () => {
    expect(width(undefined)).toBe(640);
  });

  test('each phase past the compact width widens it by a column and a gap', () => {
    // Two 20 rem columns, a 1 rem gap, 1.5 rem padding and the 4 rem close gutter.
    expect(width(phases(2))).toBe(744);
    expect(width(phases(3))).toBe(1080);
  });

  test('a many-phase stage, like Checks with its loop, stops at 90% of the window', () => {
    expect(width(checksDrilldown)).toBe(1296);
  });

  test('"Items here now" keeps the width of "What this stage does"', () => {
    expect(width(phases(2), 'items')).toBe(width(phases(2), 'does'));
  });

  test('a narrower window lowers the cap the phases stop at', () => {
    const narrow = { width: 800, height: 900 };
    expect(width(phases(1), 'does', narrow)).toBe(640);
    expect(width(checksDrilldown, 'does', narrow)).toBe(720);
  });
});

describe('"The real workflow" is as wide as the graph it draws', () => {
  test("a one-step graph, like Plan's, stays compact", () => {
    // One 168 px step with its 30 px margins, in its canvas's 16 px padding and 1 px border.
    expect(width(phases(1), 'workflow', DESKTOP, 262)).toBe(640);
  });

  test('a graph wider than the compact width takes its width plus the padding and gutter', () => {
    // 800 px of canvas, 24 px of padding and the 64 px close gutter.
    expect(width(phases(1), 'workflow', DESKTOP, 800)).toBe(888);
  });

  test('a graph wider than the window stops at 90% of it', () => {
    expect(width(phases(2), 'workflow', DESKTOP, 2000)).toBe(1296);
  });

  test('the graph sets the width even when the phases are wider', () => {
    expect(width(checksDrilldown, 'workflow', DESKTOP, 262)).toBe(640);
  });

  test("until a graph is drawn, or with none to draw, it keeps the phases' width", () => {
    expect(width(phases(2), 'workflow')).toBe(744);
    expect(width(undefined, 'workflow')).toBe(640);
  });

  test("a scrollbar's gutter widens it, so the graph is not scrolled sideways under it", () => {
    expect(
      stageModalSize({
        drilldown: phases(1),
        tab: 'workflow',
        graphWidth: 800,
        scrollbarPx: 15,
        naturalHeight: undefined,
        viewport: DESKTOP,
      }).width
    ).toBe(903);
  });

  test('a graph drawn on another tab does not widen it', () => {
    expect(width(phases(1), 'does', DESKTOP, 2000)).toBe(640);
  });
});

describe('the stage modal is as tall as its content', () => {
  const height = (naturalHeight: number | undefined): number | undefined =>
    stageModalSize({
      drilldown: phases(1),
      tab: 'does',
      graphWidth: undefined,
      naturalHeight,
      viewport: DESKTOP,
    }).height;

  test('content shorter than the window sets the height, rounded up to a whole pixel', () => {
    expect(height(300)).toBe(300);
    expect(height(300.25)).toBe(301);
  });

  test('content taller than the window stops at 90% of it, and the body scrolls', () => {
    expect(height(2000)).toBe(810);
  });

  test('before a measure the height is left to the content', () => {
    expect(height(undefined)).toBeUndefined();
  });
});

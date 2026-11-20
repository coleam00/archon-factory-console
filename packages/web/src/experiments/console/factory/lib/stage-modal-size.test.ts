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
  workflows = ['deliver']
): number =>
  stageModalSize({ stage: { drilldown, workflows }, tab, naturalHeight: undefined, viewport })
    .width;

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

  test('"The real workflow" takes the cap when it has a graph to draw, whatever the phases', () => {
    expect(width(phases(1), 'workflow')).toBe(1296);
    expect(width(undefined, 'workflow')).toBe(1296);
  });

  test('"The real workflow" of a stage with no workflow, like Merged, stays compact', () => {
    expect(width(undefined, 'workflow', DESKTOP, [])).toBe(640);
    expect(width(phases(2), 'workflow', DESKTOP, [])).toBe(744);
  });

  test('a stage the factory does not have opens compact', () => {
    expect(
      stageModalSize({
        stage: undefined,
        tab: 'workflow',
        naturalHeight: undefined,
        viewport: DESKTOP,
      }).width
    ).toBe(640);
  });

  test('a narrower window lowers the cap the phases stop at', () => {
    const narrow = { width: 800, height: 900 };
    expect(width(phases(1), 'does', narrow)).toBe(640);
    expect(width(checksDrilldown, 'does', narrow)).toBe(720);
  });
});

describe('the stage modal is as tall as its content', () => {
  const height = (naturalHeight: number | undefined): number | undefined =>
    stageModalSize({
      stage: { drilldown: phases(1), workflows: ['plan'] },
      tab: 'does',
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

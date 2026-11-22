import { describe, expect, test } from 'bun:test';
import type { FactoryItemDetail } from '../../skills/factory';
import { itemDetail, shippedView } from '../item-detail.test-fixtures';
import { durationWords } from './duration';
import { itemJourney, type Journey } from './item-journey';
import { itemColumn, placementInput } from './placement';

const NOW = Date.parse('2026-11-22T09:00:00Z');

function journey(detail: FactoryItemDetail, now = NOW): Journey {
  const facts = new Map(detail.runs.map(run => [run.runId, run]));
  const column = itemColumn(shippedView, placementInput(detail.item, facts));
  return itemJourney(shippedView, detail, column, now);
}

const segment = (of: Journey, id: string) => {
  const found = of.segments.find(entry => entry.id === id);
  if (found === undefined) throw new Error(`no column ${id}`);
  return found;
};

describe('item 111: merged after one send-back', () => {
  const of = journey(itemDetail('111'));

  test("each column's time, which together are the time from order to merge", () => {
    expect(of.segments.map(entry => [entry.id, durationWords(entry.ms)])).toEqual([
      ['intake', '1 min'],
      ['plan-build', '39 min'],
      ['checks-review', '22 min'],
      ['ready', '3 min'],
      ['merged', '0 s'],
    ]);
    expect(of.segments.reduce((sum, entry) => sum + entry.ms, 0)).toBe(of.totalMs);
    const detail = itemDetail('111');
    const first = Date.parse(detail.item.runs[0]?.startedAt ?? '');
    const merged = Date.parse(detail.item.progress?.change?.mergedAt ?? '');
    expect(of.totalMs).toBe(merged - first);
    expect(of.until).toBe('merge');
  });

  test('the checks sent it back to Plan & build once; Merged is lit', () => {
    expect(segment(of, 'checks-review').loops).toEqual([{ to: 'Plan & build', count: 1 }]);
    expect(of.segments.filter(entry => entry.lit).map(entry => entry.id)).toEqual(['merged']);
    expect(of.segments.every(entry => entry.reached)).toBe(true);
  });
});

describe('item 113: an ask the build left', () => {
  test('a pause on Plan & build, from the asking run to the answer', () => {
    const detail = itemDetail('113');
    const asking = detail.item.runs.find(run => run.outcome === 'ask');
    const answer = detail.item.answers.find(entry => entry.kind === 'ask');
    const pauses = segment(journey(detail), 'plan-build').pauses;
    expect(pauses).toEqual([
      {
        ms: Date.parse(answer?.at ?? '') - Date.parse(asking?.completedAt ?? ''),
        open: false,
      },
    ]);
  });

  test('an open ask waits to now', () => {
    const detail = structuredClone(itemDetail('113'));
    const asking = detail.item.runs.find(run => run.outcome === 'ask');
    if (asking === undefined || asking.completedAt === null) throw new Error('113 asked');
    detail.item.answers = [];
    detail.item.questions = [
      {
        kind: 'attention',
        ref: 'ask:open',
        message: 'Which title?',
        askedIn: { runId: asking.id, workflow: asking.workflow },
      } as unknown as FactoryItemDetail['item']['questions'][number],
    ];
    expect(segment(journey(detail), 'plan-build').pauses).toEqual([
      { ms: NOW - Date.parse(asking.completedAt), open: true },
    ]);
  });
});

describe('item 86: parked by triage', () => {
  const of = journey(itemDetail('86'));

  test('it stops in Intake, saying so; nothing is lit, the rest not reached', () => {
    expect(segment(of, 'intake').stopped).toBe('Parked by triage');
    expect(of.segments.some(entry => entry.lit)).toBe(false);
    expect(of.segments.filter(entry => entry.reached).map(entry => entry.id)).toEqual(['intake']);
    // Its time ends where it stopped, not now.
    expect(of.until).toBe('stop');
    expect(of.totalMs).toBe(journey(itemDetail('86'), NOW + 3_600_000).totalMs);
  });
});

describe('item 125: the three-stage delivery', () => {
  test('four send-backs to Plan & build, and the restart at intake', () => {
    const of = journey(itemDetail('125'));
    expect(segment(of, 'checks-review').loops).toEqual([{ to: 'Plan & build', count: 4 }]);
    expect(segment(of, 'plan-build').loops).toEqual([{ to: 'Intake', count: 1 }]);
    expect(of.segments.reduce((sum, entry) => sum + entry.ms, 0)).toBe(of.totalMs);
  });
});

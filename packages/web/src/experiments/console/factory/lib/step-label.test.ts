import { describe, expect, test } from 'bun:test';
import { VIEW } from './board.test-fixtures';
import { roundOfStep, runLine, stepLabel } from './step-label';

const RUN = 'run-1';
// The shipped view counts rounds by stage-form runs; a loop-form source still reads its round.
const LOOPED = { ...VIEW, rounds: { workflow: 'deliver', loop: 'rounds' } };

describe('stepLabel', () => {
  test('a step the view names reads as that name', () => {
    expect(stepLabel(VIEW, 'stage-build', 'build__build')).toBe('Writes or fixes the change');
    expect(stepLabel(VIEW, 'stage-host', 'rounds__host')).toBe('Reads CI and PR reviews');
  });

  test('a doubled include name collapses', () => {
    expect(stepLabel(VIEW, 'other', 'build__build')).toBe('build');
  });

  test('an include reads as include: inner', () => {
    expect(stepLabel(VIEW, 'other', 'judge__inner')).toBe('judge: inner');
  });

  test('a loop body of the rounds loop takes its round in place of the loop prefix', () => {
    expect(stepLabel(LOOPED, 'deliver', 'rounds.review__review', 2)).toBe('review, round 2');
    expect(stepLabel(LOOPED, 'deliver', 'rounds', 3)).toBe('rounds, round 3');
  });

  test('a step outside the rounds loop never reads its round', () => {
    expect(stepLabel(LOOPED, 'stage-host', 'rounds__host', 2)).toBe('Reads CI and PR reviews');
    expect(stepLabel(LOOPED, 'plan', 'rounds.fix', 2)).toBe('fix');
    expect(stepLabel(VIEW, 'stage-check', 'review__review', 2)).toBe('Code review');
  });

  test('an unknown id reads with separators as spaces, and never as nothing', () => {
    expect(stepLabel(VIEW, 'deliver', 'rounds.mystery__mystery')).toBe('mystery');
    expect(stepLabel(VIEW, 'deliver', 'some_odd-id')).toBe('some odd id');
    expect(stepLabel(VIEW, 'deliver', '__')).toBe('__');
  });
});

describe('roundOfStep', () => {
  const round = { runId: RUN, iteration: 2 };

  test("the latest round, on this run's step of the rounds loop", () => {
    expect(roundOfStep(LOOPED, 'deliver', 'rounds.tests__tests', round, RUN)).toBe(2);
  });

  test('no round from another run, or for a step outside the loop', () => {
    expect(roundOfStep(LOOPED, 'deliver', 'rounds.tests__tests', round, 'run-2')).toBeUndefined();
    expect(roundOfStep(LOOPED, 'deliver', 'build__build', round, RUN)).toBeUndefined();
    expect(roundOfStep(LOOPED, 'deliver', 'rounds.fix', null, RUN)).toBeUndefined();
  });
});

describe('runLine', () => {
  test('reads stage, step name and round, the round once', () => {
    const line = runLine(
      LOOPED,
      { runId: RUN, workflow: 'deliver', step: 'rounds.review__review' },
      { runId: RUN, iteration: 2 }
    );
    expect(line.text).toBe('Build · review · round 2');
    expect(line.text.match(/round/g)).toHaveLength(1);
  });

  test('a step outside the loop reads without a round', () => {
    expect(
      runLine(
        LOOPED,
        { runId: RUN, workflow: 'stage-build', step: 'build__build' },
        { runId: RUN, iteration: 2 }
      ).text
    ).toBe('Build · Writes or fixes the change');
  });

  test('between steps', () => {
    expect(runLine(VIEW, { runId: RUN, workflow: 'plan', step: null }, null).text).toBe(
      'Plan · between steps'
    );
  });
});

import { describe, expect, test } from 'bun:test';
import { placeItem, type Placement } from './board';
import { endedWith, itemWith, realItem, runningOn, softwareFactory } from './map.test-fixtures';

const view = softwareFactory;
const at = (stage: string, working = false): Placement => ({ kind: 'stage', stage, working });

describe('placing an item', () => {
  test('1: a running run goes to the stage whose nodes cover its step', () => {
    expect(placeItem(view, realItem('8'))).toEqual(at('checks', true));
    expect(placeItem(view, realItem('5'))).toEqual(at('build', true));
    expect(placeItem(view, itemWith('h', runningOn('deliver', 'hostrounds.host__host')))).toEqual(
      at('host', true)
    );
    // A dotted entry covers the steps under it.
    expect(placeItem(view, itemWith('f', runningOn('deliver', 'rounds.fix.inner')))).toEqual(
      at('build', true)
    );
  });

  test('1: between steps, or on a step no stage covers, the first stage of the workflow', () => {
    expect(placeItem(view, itemWith('n', runningOn('deliver', null)))).toEqual(at('build', true));
    expect(placeItem(view, itemWith('u', runningOn('deliver', 'setup')))).toEqual(
      at('build', true)
    );
    expect(placeItem(view, itemWith('t', runningOn('triage', 'decide')))).toEqual(
      at('triage', true)
    );
  });

  test('1: a running workflow no stage lists is unplaced, not guessed', () => {
    expect(placeItem(view, itemWith('x', runningOn('elsewhere', 'a')))).toEqual({
      kind: 'unplaced',
      reason: 'no-stage',
    });
  });

  test('2: a merged change is landed; unknown or unmerged is not', () => {
    expect(placeItem(view, realItem('7'))).toEqual(at('landed'));
    const change = { url: 'https://example.test/pull/1', mergedAt: null };
    expect(
      placeItem(
        view,
        itemWith('m', {
          ...endedWith('deliver', 'completed', 'ready'),
          change: { ...change, merged: 'unknown' },
        })
      )
    ).toEqual(at('ready'));
    expect(
      placeItem(
        view,
        itemWith('m', {
          ...endedWith('deliver', 'completed', 'ready'),
          change: { ...change, merged: false },
        })
      )
    ).toEqual(at('ready'));
  });

  test('3: a completed outcome in placement is that stage', () => {
    expect(placeItem(view, realItem('6'))).toEqual(at('build'));
    expect(placeItem(view, realItem('3'))).toEqual(at('build'));
    expect(placeItem(view, itemWith('w', endedWith('deliver', 'completed', 'waiting')))).toEqual(
      at('host')
    );
  });

  test('4: an outcome in endings, exact or by workflow:*, is off the board under its label', () => {
    expect(placeItem(view, itemWith('s', endedWith('triage', 'completed', 'skip')))).toEqual({
      kind: 'ended',
      label: 'Closed by triage',
    });
    expect(placeItem(view, itemWith('p', endedWith('plan', 'completed', 'stop')))).toEqual({
      kind: 'ended',
      label: 'Stopped at planning',
    });
    expect(placeItem(view, itemWith('q', endedWith('triage', 'completed', null)))).toEqual({
      kind: 'ended',
      label: 'Closed by triage',
    });
  });

  test('5: a failed or cancelled run is in the first stage of its workflow', () => {
    expect(placeItem(view, itemWith('f', endedWith('deliver', 'failed', null)))).toEqual(
      at('build')
    );
    expect(placeItem(view, itemWith('c', endedWith('land', 'cancelled', null)))).toEqual(
      at('ready')
    );
    // A failed triage is not an ending: endings read completed outcomes only.
    expect(placeItem(view, itemWith('t', endedWith('triage', 'failed', null)))).toEqual(
      at('triage')
    );
  });

  test('6: otherwise the first stage, waiting', () => {
    expect(placeItem(view, itemWith('o', { running: null, ended: null }))).toEqual(at('triage'));
    expect(placeItem(view, itemWith('d', endedWith('deliver', 'completed', 'odd')))).toEqual(
      at('triage')
    );
  });

  test('an item without progress is unplaced', () => {
    expect(placeItem(view, itemWith('z', null))).toEqual({
      kind: 'unplaced',
      reason: 'no-progress',
    });
  });
});

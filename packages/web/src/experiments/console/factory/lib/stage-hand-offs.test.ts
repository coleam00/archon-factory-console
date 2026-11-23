import { describe, expect, test } from 'bun:test';
import { shippedView } from '../item-detail.test-fixtures';
import { layoutMap, mapCards } from './map-layout';
import { stageHandOffs } from './stage-hand-offs';

describe('where items go from a stage', () => {
  test('every arrow out of the stage into another, in declared order and words', () => {
    expect(stageHandOffs(shippedView, 'build')).toEqual([
      { label: 'built', to: 'checks', toLabel: 'Checks' },
      { label: 'fixed for CI', to: 'host', toLabel: 'CI and review' },
      { label: 'replan', to: 'plan', toLabel: 'Plan' },
      { label: 'drop or reshape', to: 'ready', toLabel: 'Ready to merge' },
    ]);
  });

  test("every outcome a map pill folds into +N reads in one of its left card's stages", () => {
    const cards = mapCards(shippedView);
    const folded = layoutMap(shippedView).arrows.filter(
      arrow => arrow.outcomes.length > arrow.lines.length
    );
    // The shipped map folds one pill; the rule below holds for any.
    expect(folded.length).toBeGreaterThan(0);
    for (const arrow of folded) {
      const stages = cards.find(card => card.id === arrow.from)?.stages ?? [];
      const listed = stages.flatMap(stage =>
        stageHandOffs(shippedView, stage).flatMap(handOff =>
          (handOff.label?.split(', ') ?? []).map(part => `${part} → ${handOff.toLabel}`)
        )
      );
      for (const outcome of arrow.outcomes) {
        // A pill names a skipped-to card ("<outcome> → <card>"); the modal names the stage.
        const [word] = outcome.split(' → ');
        expect(listed.some(line => line.startsWith(`${word ?? ''} → `))).toBe(true);
      }
    }
  });
});

import { describe, expect, test } from 'bun:test';
import { promptLead } from './prompt-lead';

describe('promptLead', () => {
  test("is the paragraph under the prompt's title, as written", () => {
    expect(
      promptLead('# Land one change\n\nLand this change on its `$INPUTS.land_on`.\n\nThe item:\n')
    ).toBe('Land this change on its `$INPUTS.land_on`.');
  });

  test('is the first paragraph of a prompt with no title', () => {
    expect(promptLead('Decide it.\nOn two lines.\n\n## More')).toBe('Decide it.\nOn two lines.');
  });

  test('is null when the prompt opens with something other than prose', () => {
    expect(promptLead('# Title\n\n- a list\n\nLater prose.')).toBeNull();
    expect(promptLead('# Title\n\n## Section\n\nProse.')).toBeNull();
    expect(promptLead('')).toBeNull();
  });
});

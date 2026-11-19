import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { KINDS } from './overview-kinds';

/**
 * The least hue gap between two kinds' colours. Distinct tokens are not enough: the check's
 * old colour and the outcome's were two tokens two degrees apart, and on a 3 px bar lightness
 * alone does not tell them apart. The console's non-purple hue families sit about 30 degrees
 * apart at the closest (green 140, teal 168).
 */
const MIN_HUE_GAP = 25;
/** Purple through pink, which owner change 1 keeps off cards. */
const PURPLE_PINK: [number, number] = [270, 350];
/** Under this chroma a colour reads as grey, whatever its hue. */
const MIN_CHROMA = 0.1;

/** Every `--name: value;` the console sees: index.css's :root, then theme.css's, which wins. */
function tokens(): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of ['../../../../index.css', '../../theme.css']) {
    const css = readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const [, name, value] of css.matchAll(/(--[\w-]+):\s*([^;]+);/g))
      map.set(name as string, (value as string).trim());
  }
  return map;
}

/** A colour's oklch lightness, chroma and hue, following `var()` until a literal. */
function oklch(colour: string, map: Map<string, string>): [number, number, number] {
  const ref = /^var\((--[\w-]+)\)$/.exec(colour);
  if (ref) {
    const value = map.get(ref[1] as string);
    if (value === undefined) throw new Error(`no token ${ref[1] as string}`);
    return oklch(value, map);
  }
  const literal = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(colour);
  if (!literal) throw new Error(`not an oklch colour: ${colour}`);
  return [Number(literal[1]), Number(literal[2]), Number(literal[3])];
}

const hueGap = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

describe('the overview kind colours', () => {
  const map = tokens();
  const kinds = Object.entries(KINDS).map(([kind, { color }]) => ({
    kind,
    hue: oklch(color, map)[2],
    chroma: oklch(color, map)[1],
  }));

  test('every kind is a saturated colour, none purple or pink', () => {
    for (const { kind, hue, chroma } of kinds) {
      expect({ kind, saturated: chroma >= MIN_CHROMA }).toEqual({ kind, saturated: true });
      const purple = hue >= PURPLE_PINK[0] && hue <= PURPLE_PINK[1];
      expect({ kind, purple }).toEqual({ kind, purple: false });
    }
  });

  test('no two kinds share a colour: every pair is at least MIN_HUE_GAP degrees of hue apart', () => {
    const close: string[] = [];
    for (const [i, a] of kinds.entries())
      for (const b of kinds.slice(i + 1))
        if (hueGap(a.hue, b.hue) < MIN_HUE_GAP)
          close.push(`${a.kind}/${b.kind}: ${hueGap(a.hue, b.hue).toString()}°`);
    expect(close).toEqual([]);
  });
});

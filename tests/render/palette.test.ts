import { describe, expect, it } from 'vitest';
import { BASE_PACK } from '../../src/content/packs/base/manifest';
import { hsl } from '../../src/content/color';
import { MAP_COLORS, type RGB } from '../../src/render/palette';

const all: Array<[string, RGB]> = [
  ...BASE_PACK.biomes.map((b): [string, RGB] => [b.id, b.color]),
  ...Object.entries(MAP_COLORS).map(([k, v]): [string, RGB] => [`MAP_COLORS.${k}`, v]),
];

describe('palette', () => {
  it('цвета — целые байты', () => {
    for (const [name, c] of all) {
      for (const v of c) {
        expect(Number.isInteger(v) && v >= 0 && v <= 255, name).toBe(true);
      }
    }
  });

  it.each(all)('%s приглушён: насыщенность ≤ 0.45, светлота 0.2..0.9', (_name, c) => {
    const { s, l } = hsl(c);
    expect(s).toBeLessThanOrEqual(0.45);
    expect(l).toBeGreaterThanOrEqual(0.2);
    expect(l).toBeLessThanOrEqual(0.9);
  });
});

import { describe, expect, it } from 'vitest';
import { MAP_COLORS, PALETTE, type RGB } from '../../src/render/palette';
import { BIOMES } from '../../src/sim/world/types';

function hsl([r, g, b]: RGB): { s: number; l: number } {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

const all: Array<[string, RGB]> = [
  ...Object.entries(PALETTE),
  ...Object.entries(MAP_COLORS).map(([k, v]): [string, RGB] => [`MAP_COLORS.${k}`, v]),
];

describe('palette', () => {
  it('у каждого биома есть цвет', () => {
    for (const b of BIOMES) expect(PALETTE[b], b).toBeDefined();
  });

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

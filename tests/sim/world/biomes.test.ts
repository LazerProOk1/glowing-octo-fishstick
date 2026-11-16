import { describe, expect, it } from 'vitest';
import { createRng } from '../../../src/sim/rng';
import { generateHeight } from '../../../src/sim/world/heightmap';
import { computeClimate } from '../../../src/sim/world/climate';
import { classifyBiome, computeBiomes } from '../../../src/sim/world/biomes';
import { BIOMES, SEA_LEVEL, WORLD_H, WORLD_W } from '../../../src/sim/world/types';

describe('classifyBiome', () => {
  it('water: ocean vs coast', () => {
    expect(classifyBiome(SEA_LEVEL - 0.06, 10, 0.5)).toBe('ocean');
    expect(classifyBiome(SEA_LEVEL - 0.01, 10, 0.5)).toBe('coast');
    expect(classifyBiome(SEA_LEVEL, 10, 0.5)).toBe('coast');
  });
  it('relief', () => {
    expect(classifyBiome(0.9, 10, 0.5)).toBe('mountains');
    expect(classifyBiome(0.8, 10, 0.5)).toBe('hills');
  });
  it('climate', () => {
    expect(classifyBiome(0.6, -15, 0.5)).toBe('glacier');
    expect(classifyBiome(0.6, 26, 0.8)).toBe('jungle');
    expect(classifyBiome(0.6, 25, 0.1)).toBe('desert');
  });
});

describe('world biomes (seed "1")', () => {
  const w = WORLD_W;
  const h = WORLD_H;
  const height = generateHeight(createRng('1'), w, h);
  const { temperature, moisture } = computeClimate(createRng('1').fork('climate'), height, w, h);
  const biomes = computeBiomes(height, temperature, moisture);
  const name = (i: number): string => BIOMES[biomes[i] ?? 0] ?? '';

  it('array sizes and ranges', () => {
    expect(temperature.length).toBe(w * h);
    expect(moisture.length).toBe(w * h);
    expect(biomes.length).toBe(w * h);
    for (let i = 0; i < moisture.length; i += 97) {
      expect(moisture[i]).toBeGreaterThanOrEqual(0);
      expect(moisture[i]).toBeLessThanOrEqual(1);
    }
  });

  it('latitude sanity', () => {
    for (let y = 0; y < h; y++) {
      const polar = y < 20 || y > 1003;
      const equator = y >= 500 && y <= 524;
      if (!polar && !equator) continue;
      for (let x = 0; x < w; x++) {
        const b = name(y * w + x);
        if (polar) expect(b === 'jungle' || b === 'desert').toBe(false);
        if (equator) expect(b === 'tundra' || b === 'glacier').toBe(false);
      }
    }
  });

  it('has at least 10 land biomes', () => {
    const seen = new Set<string>();
    for (let i = 0; i < biomes.length; i++) {
      const b = name(i);
      if (b !== 'ocean' && b !== 'coast') seen.add(b);
    }
    expect(seen.size).toBeGreaterThanOrEqual(10);
  });

  it('water biomes only on water, land biomes only on land', () => {
    let wrong = 0;
    for (let i = 0; i < biomes.length; i++) {
      const b = name(i);
      const water = b === 'ocean' || b === 'coast';
      if (water !== (height[i] ?? 0) <= SEA_LEVEL) wrong++;
    }
    expect(wrong).toBe(0);
  });
});

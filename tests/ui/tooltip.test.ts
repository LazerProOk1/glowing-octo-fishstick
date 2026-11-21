import { describe, expect, it } from 'vitest';
import { resolveBiomes } from '../../src/content/registry';
import type { Province } from '../../src/sim/world/types';
import { fogInfo, provinceInfo } from '../../src/ui/tooltip';

function province(p: Partial<Province>): Province {
  return { id: 0, isLand: true, water: null, cellCount: 1, center: { x: 0, y: 0 }, biome: 'plains', neighbors: [], coastal: false, lakeside: false, ...p };
}

describe('provinceInfo', () => {
  const biomes = resolveBiomes({});
  it('a lake is labelled "Озеро · вода"', () => {
    expect(provinceInfo(province({ isLand: false, water: 'lake', biome: 'lake' }), biomes)).toBe('Озеро · вода');
  });
  it('sea and land', () => {
    expect(provinceInfo(province({ isLand: false, water: 'sea', biome: 'ocean' }), biomes)).toBe('Океан · море');
    expect(provinceInfo(province({ biome: 'taiga', coastal: true }), biomes)).toBe('Тайга · суша · прибрежная');
  });
});

describe('fogInfo', () => {
  const biomes = resolveBiomes({});
  it('unexplored land: title and terrain type only', () => {
    expect(fogInfo(province({ biome: 'taiga', coastal: true }), biomes)).toEqual({ title: 'Неизведанная земля', info: 'Тайга' });
  });
  it('sea and lake are unexplored sea', () => {
    expect(fogInfo(province({ isLand: false, water: 'sea', biome: 'ocean' }), biomes)).toEqual({ title: 'Неизведанное море', info: 'Океан' });
    expect(fogInfo(province({ isLand: false, water: 'lake', biome: 'lake' }), biomes).title).toBe('Неизведанное море');
  });
});

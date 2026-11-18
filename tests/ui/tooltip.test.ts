import { describe, expect, it } from 'vitest';
import { resolveBiomes } from '../../src/content/registry';
import type { Province } from '../../src/sim/world/types';
import { provinceInfo } from '../../src/ui/tooltip';

function province(p: Partial<Province>): Province {
  return { id: 0, isLand: true, water: null, cellCount: 1, center: { x: 0, y: 0 }, biome: 'plains', neighbors: [], coastal: false, ...p };
}

describe('provinceInfo', () => {
  const biomes = resolveBiomes({});
  it('озеро подписано «Озеро · вода»', () => {
    expect(provinceInfo(province({ isLand: false, water: 'lake', biome: 'lake' }), biomes)).toBe('Озеро · вода');
  });
  it('море и суша', () => {
    expect(provinceInfo(province({ isLand: false, water: 'sea', biome: 'ocean' }), biomes)).toBe('Океан · море');
    expect(provinceInfo(province({ biome: 'taiga', coastal: true }), biomes)).toBe('Тайга · суша · прибрежная');
  });
});

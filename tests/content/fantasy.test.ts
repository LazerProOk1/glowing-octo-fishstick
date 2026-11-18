import { beforeAll, describe, expect, it } from 'vitest';
import type { BiomeDef, GenOptions } from '../../src/content/biomes/types';
import { resolveBiomes } from '../../src/content/registry';
import { createRng } from '../../src/sim/rng';
import { computeBiomes } from '../../src/sim/world/biomes';
import { computeArcana, computeClimate } from '../../src/sim/world/climate';
import { generateWorld } from '../../src/sim/world/generateWorld';
import { generateHeight } from '../../src/sim/world/heightmap';
import { normalizeShoreline } from '../../src/sim/world/shoreline';
import { SEA_LEVEL, WORLD_H, WORLD_W, type World } from '../../src/sim/world/types';
import { purity } from '../sim/world/provinceMetrics';

const W = WORLD_W;
const H = WORLD_H;
const FANTASY = ['mushroom_forest', 'magic_forest', 'ash_wastes', 'crystal_mountains'];
const SEEDS = ['1', '2', 'Бета-7', 'worldbox'];

/** Биомы на карте после берегов (как в generateWorld, без рек и провинций). */
function surfaceBiomes(seed: string, options: GenOptions): { defs: BiomeDef[]; height: Float32Array; biomes: Uint8Array } {
  const defs = resolveBiomes(options);
  const rng = createRng(seed);
  const raw = generateHeight(rng.fork('height'), W, H);
  const { temperature, moisture } = computeClimate(rng.fork('climate'), raw, W, H);
  const arcana = computeArcana(seed, W, H);
  const codes = computeBiomes(defs, raw, temperature, moisture, arcana);
  const { height, biomes } = normalizeShoreline(raw, codes, W, H, defs);
  return { defs, height, biomes };
}

function countById(defs: BiomeDef[], biomes: Uint8Array): Map<string, number> {
  const n = new Int32Array(defs.length);
  for (let i = 0; i < biomes.length; i++) n[biomes[i]!]!++;
  return new Map(defs.map((d, k) => [d.id, n[k]!]));
}

describe('фэнтези-биомы', () => {
  const counts = new Map<string, Map<string, number>>();
  const land = new Map<string, number>();
  beforeAll(() => {
    for (const seed of SEEDS) {
      const { defs, height, biomes } = surfaceBiomes(seed, { fantasy: true });
      counts.set(seed, countById(defs, biomes));
      let l = 0;
      for (let i = 0; i < height.length; i++) if (height[i]! > SEA_LEVEL) l++;
      land.set(seed, l);
    }
  }, 120000);

  it('фэнтези выключено: в списке и на карте нет фэнтези-биомов', () => {
    const { defs, biomes } = surfaceBiomes('1', {});
    expect(defs.some((d) => d.fantasy)).toBe(false);
    let max = 0;
    for (const b of biomes) if (b > max) max = b;
    expect(max).toBeLessThan(defs.length);
  });

  it('каждый фэнтези-биом занимает ≥ 200 клеток хотя бы на одном сиде', () => {
    for (const id of FANTASY) {
      const best = Math.max(...SEEDS.map((s) => counts.get(s)!.get(id)!));
      expect(best, id).toBeGreaterThanOrEqual(200);
    }
  });

  it('фэнтези заметно, но не преобладает: 3..12 % суши на каждом сиде', () => {
    for (const seed of SEEDS) {
      const c = counts.get(seed)!;
      const f = FANTASY.reduce((s, id) => s + c.get(id)!, 0);
      const share = f / land.get(seed)!;
      expect(share, seed).toBeGreaterThanOrEqual(0.03);
      expect(share, seed).toBeLessThanOrEqual(0.12);
    }
  });
});

describe.each([['swamp'], ['desert']])('выключенный биом %s', (off) => {
  let base: World;
  let world: World;
  beforeAll(() => {
    base = generateWorld('1');
    world = generateWorld('1', { disabledBiomes: [off] });
  }, 120000);

  it('биома нет ни в списке, ни на карте, его клетки достались другим биомам суши', () => {
    expect(world.biomes.map((b) => b.id)).not.toContain(off);
    const was = base.biomes.findIndex((b) => b.id === off);
    let moved = 0;
    for (let i = 0; i < base.biome.length; i++) {
      if (base.biome[i] !== was) continue;
      moved++;
      expect(world.biomes[world.biome[i]!]!.kind).toBe('land');
    }
    expect(moved).toBeGreaterThan(0);
    // Рельеф не зависит от набора биомов.
    expect(Buffer.from(world.height.buffer).equals(Buffer.from(base.height.buffer))).toBe(true);
  });

  it('провинции: каждая клетка в провинции, биом провинции существует, суша однородна', () => {
    const ids = new Set(world.biomes.map((b) => b.id));
    for (const p of world.provinces) expect(ids.has(p.biome)).toBe(true);
    const pur = purity(world.biome, world.provinceOf, world.provinces.length);
    const land = world.provinces.filter((p) => p.isLand);
    const pure90 = land.filter((p) => pur[p.id]! >= 0.9).length / land.length;
    expect(pure90).toBeGreaterThanOrEqual(0.9);
  });
});

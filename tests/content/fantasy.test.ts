import { beforeAll, describe, expect, it } from 'vitest';
import type { BiomeDef, GenOptions } from '../../src/content/biomes/types';
import { resolveBiomes } from '../../src/content/registry';
import { createRng } from '../../src/sim/rng';
import { computeBiomes } from '../../src/sim/world/biomes';
import { computeArcana, computeClimate } from '../../src/sim/world/climate';
import { generateWorld } from '../../src/sim/world/generateWorld';
import { generateHeight } from '../../src/sim/world/heightmap';
import { normalizeShoreline } from '../../src/sim/world/shoreline';
import { defaultParams, SIZE_PRESETS } from '../../src/sim/world/params';
import type { World } from '../../src/sim/world/types';
import { SEA_LEVEL } from '../../src/content/terrainLevels';
import { purity } from '../sim/world/provinceMetrics';

const { w: W, h: H } = SIZE_PRESETS.medium;
const FANTASY = ['mushroom_forest', 'magic_forest', 'ash_wastes', 'crystal_mountains'];
const SEEDS = ['1', '2', 'Бета-7', 'worldbox'];

/** Biomes on the map after the shores (as in generateWorld, without rivers and provinces). */
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

describe('fantasy biomes', () => {
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

  it('fantasy off: no fantasy biomes in the list or on the map', () => {
    const { defs, biomes } = surfaceBiomes('1', {});
    expect(defs.some((d) => d.fantasy)).toBe(false);
    const fantasyIds = new Set(FANTASY);
    const onMap = new Set<string>();
    for (const b of biomes) onMap.add(defs[b]?.id ?? `код ${b}`);
    for (const id of onMap) expect(defs.some((d) => d.id === id), id).toBe(true);
    expect([...onMap].filter((id) => fantasyIds.has(id))).toEqual([]);
  });

  it('every fantasy biome covers ≥ 200 cells on at least one seed', () => {
    for (const id of FANTASY) {
      const best = Math.max(...SEEDS.map((s) => counts.get(s)!.get(id)!));
      expect(best, id).toBeGreaterThanOrEqual(200);
    }
  });

  it('fantasy is noticeable but not dominant: 3..12% of land on every seed', () => {
    for (const seed of SEEDS) {
      const c = counts.get(seed)!;
      const f = FANTASY.reduce((s, id) => s + c.get(id)!, 0);
      const share = f / land.get(seed)!;
      expect(share, seed).toBeGreaterThanOrEqual(0.03);
      expect(share, seed).toBeLessThanOrEqual(0.12);
    }
  });
});

describe.each([['swamp'], ['desert']])('disabled biome %s', (off) => {
  let base: World;
  let world: World;
  beforeAll(() => {
    base = generateWorld(defaultParams('1'));
    const p = defaultParams('1');
    world = generateWorld({ ...p, options: { ...p.options, disabledBiomes: [off] } });
  }, 120000);

  it('the biome is neither in the list nor on the map, its cells went to other land biomes', () => {
    expect(world.biomes.map((b) => b.id)).not.toContain(off);
    const was = base.biomes.findIndex((b) => b.id === off);
    let moved = 0;
    for (let i = 0; i < base.biome.length; i++) {
      if (base.biome[i] !== was) continue;
      moved++;
      expect(world.biomes[world.biome[i]!]!.kind).toBe('land');
    }
    expect(moved).toBeGreaterThan(0);
    // The terrain does not depend on the biome set.
    expect(Buffer.from(world.height.buffer).equals(Buffer.from(base.height.buffer))).toBe(true);
  });

  it('provinces: every cell belongs to a province, the province biome exists, land is uniform', () => {
    const ids = new Set(world.biomes.map((b) => b.id));
    for (const p of world.provinces) expect(ids.has(p.biome)).toBe(true);
    const pur = purity(world.biome, world.provinceOf, world.provinces.length);
    const land = world.provinces.filter((p) => p.isLand);
    const pure90 = land.filter((p) => pur[p.id]! >= 0.9).length / land.length;
    expect(pure90).toBeGreaterThanOrEqual(0.9);
  });
});

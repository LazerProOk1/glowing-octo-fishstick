import { describe, expect, it } from 'vitest';
import { pickStartGroup } from '../../src/game/start';
import { generateWorld } from '../../src/sim/world/generateWorld';
import { defaultParams } from '../../src/sim/world/params';
import type { World } from '../../src/sim/world/types';

const cache = new Map<string, World>();
const small = (seed: string): World => {
  const hit = cache.get(seed);
  if (hit) return hit;
  const p = defaultParams(seed);
  const w = generateWorld({ ...p, options: { ...p.options, size: 'small' } });
  cache.set(seed, w);
  return w;
};

/** Hand-made world: each entry is [isLand, neighbours]; every land province has 100 cells. */
const tiny = (spec: Array<[boolean, number[]]>): World =>
  ({
    params: { seed: 't' },
    biomes: [{ id: 'plains', startable: true }],
    provinces: spec.map(([isLand, neighbors], id) => ({
      id,
      isLand,
      neighbors,
      biome: 'plains',
      cellCount: 100,
      coastal: false,
      lakeside: false,
    })),
    adjacency: [],
    edgesOf: spec.map(() => []),
  }) as unknown as World;

describe('pickStartGroup', { timeout: 60_000 }, () => {
  it('is deterministic', () => {
    const a = small('1');
    const p = defaultParams('1');
    const fresh = generateWorld({ ...p, options: { ...p.options, size: 'small' } });
    expect(fresh).not.toBe(a);
    expect(pickStartGroup(fresh)).toEqual(pickStartGroup(a));
  });

  it.each(['1', 'worldbox', 'a', 'b', 'c'])('seed %s: 3 connected land provinces, ≥ 600 cells', (seed) => {
    const w = small(seed);
    const g = pickStartGroup(w);
    expect(new Set(g).size).toBe(3);
    for (const id of g) {
      expect(w.provinces[id]!.isLand).toBe(true);
      expect(g.some((o) => o !== id && w.provinces[id]!.neighbors.includes(o))).toBe(true);
    }
    expect(g.reduce((s, id) => s + w.provinces[id]!.cellCount, 0)).toBeGreaterThanOrEqual(600);
    expect(w.biomes.find((b) => b.id === w.provinces[g[0]!]!.biome)?.startable).toBe(true);
  });

  it('still starts on land when no startable biome is enabled', () => {
    const base = small('1');
    const w = { ...base, biomes: base.biomes.map((b) => ({ ...b, startable: false })) };
    const g = pickStartGroup(w);
    expect(g.length).toBeGreaterThan(0);
    expect(w.provinces[g[0]!]!.isLand).toBe(true);
  });

  it('falls back to a smaller group on a 2-province island', () => {
    const w = tiny([[true, [1, 2]], [true, [0, 2]], [false, [0, 1]]]);
    expect([...pickStartGroup(w)].sort()).toEqual([0, 1]);
  });

  it('falls back to a 1-province islet', () => {
    expect(pickStartGroup(tiny([[true, [1]], [false, [0]]]))).toEqual([0]);
  });

  it('takes a group of 3 even below 600 cells', () => {
    const w = tiny([[true, [1]], [true, [0, 2]], [true, [1]]]);
    expect(pickStartGroup(w)).toHaveLength(3);
  });

  it('throws only when there is no land', () => {
    const w = small('1');
    const sea = { ...w, provinces: w.provinces.map((p) => ({ ...p, isLand: false })) };
    expect(() => pickStartGroup(sea)).toThrow(/no_start_province/);
  });
});

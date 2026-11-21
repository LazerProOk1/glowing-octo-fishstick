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

/** Hand-made world: each entry is [isLand, neighbours, cells?, extra fields?]; default 100 cells. */
type Spec = [boolean, number[], number?, Record<string, unknown>?];
const tiny = (spec: Spec[], adjacency: unknown[] = [], edgesOf?: number[][]): World =>
  ({
    params: { seed: 't' },
    biomes: [{ id: 'plains', startable: true }],
    provinces: spec.map(([isLand, neighbors, cellCount, extra], id) => ({
      id,
      isLand,
      neighbors,
      biome: 'plains',
      cellCount: cellCount ?? 100,
      coastal: false,
      lakeside: false,
      ...extra,
    })),
    adjacency,
    edgesOf: edgesOf ?? spec.map(() => []),
  }) as unknown as World;

describe('pickStartGroup', { timeout: 60_000 }, () => {
  it('is deterministic', () => {
    const a = small('1');
    const p = defaultParams('1');
    const fresh = generateWorld({
      ...p,
      options: { ...p.options, size: 'small' },
    });
    expect(fresh).not.toBe(a);
    expect(pickStartGroup(fresh)).toEqual(pickStartGroup(a));
  });

  it.each(['1', 'worldbox', 'a', 'b', 'c'])(
    'seed %s: 3 connected land provinces, ≥ 600 cells',
    (seed) => {
      const w = small(seed);
      const g = pickStartGroup(w);
      expect(new Set(g).size).toBe(3);
      for (const id of g) {
        expect(w.provinces[id]!.isLand).toBe(true);
        expect(g.some((o) => o !== id && w.provinces[id]!.neighbors.includes(o))).toBe(true);
      }
      expect(g.reduce((s, id) => s + w.provinces[id]!.cellCount, 0)).toBeGreaterThanOrEqual(600);
      expect(w.biomes.find((b) => b.id === w.provinces[g[0]!]!.biome)?.startable).toBe(true);
    },
  );

  it('still starts on land when no startable biome is enabled', () => {
    const base = small('1');
    const w = {
      ...base,
      biomes: base.biomes.map((b) => ({ ...b, startable: false })),
    };
    const g = pickStartGroup(w);
    expect(g.length).toBeGreaterThan(0);
    expect(w.provinces[g[0]!]!.isLand).toBe(true);
  });

  it('falls back to a smaller group on a 2-province island', () => {
    const w = tiny([
      [true, [1, 2]],
      [true, [0, 2]],
      [false, [0, 1]],
    ]);
    expect([...pickStartGroup(w)].sort()).toEqual([0, 1]);
  });

  it('falls back to a 1-province islet', () => {
    expect(
      pickStartGroup(
        tiny([
          [true, [1]],
          [false, [0]],
        ]),
      ),
    ).toEqual([0]);
  });

  it('takes a group of 3 even below 600 cells', () => {
    const w = tiny([
      [true, [1]],
      [true, [0, 2]],
      [true, [1]],
    ]);
    expect(pickStartGroup(w)).toHaveLength(3);
  });

  // Two disjoint chains 0-1-2 and 3-4-5 of the given cell counts.
  const chains = (a: number, b: number, extraA: Record<string, unknown> = {}): Spec[] => [
    [true, [1], a, extraA],
    [true, [0, 2], a],
    [true, [1], a],
    [true, [4], b],
    [true, [3, 5], b],
    [true, [4], b],
  ];
  // The pick is random among equals, so check many seeds: passing by luck is 2^-12.
  const picks = (w: World): number[][] =>
    Array.from({ length: 12 }, (_, i) =>
      [...pickStartGroup({ ...w, params: { ...w.params, seed: `s${i}` } })].sort(),
    );

  it('prefers a group of >= 600 cells over a smaller one', () => {
    for (const g of picks(tiny(chains(100, 300)))) expect(g).toEqual([3, 4, 5]);
  });

  it('prefers a group touching water (coast)', () => {
    for (const g of picks(tiny(chains(200, 200, { coastal: true })))) expect(g).toEqual([0, 1, 2]);
  });

  it('prefers a group touching water (river edge only)', () => {
    const w = tiny(chains(200, 200), [{ riverLength: 1 }], [[], [0], [], [], [], []]);
    for (const g of picks(w)) expect(g).toEqual([0, 1, 2]);
  });

  it('prefers a group with room to grow over a water group with no outer land', () => {
    // Chain 0-1-2 touches water but has no land around; chain 3-4-5 has 4 outer land provinces.
    const spec: Spec[] = [
      [true, [1], 300, { coastal: true }],
      [true, [0, 2], 300],
      [true, [1], 300],
      [true, [4, 6, 7], 300],
      [true, [3, 5, 8], 300],
      [true, [4, 9], 300],
      [true, [3], 100],
      [true, [3], 100],
      [true, [4], 100],
      [true, [5], 100],
    ];
    for (const g of picks(tiny(spec))) expect(g.every((id) => id >= 3 && id <= 5)).toBe(true);
  });

  it('keeps desert out of the group when another neighbour exists', () => {
    const w = tiny([
      [true, [1, 2]],
      [true, [0], 100, { biome: 'desert' }],
      [true, [0, 3]],
      [true, [2]],
    ]);
    for (const g of picks(w)) expect(g).not.toContain(1);
  });

  it('throws only when there is no land', () => {
    const w = small('1');
    const sea = {
      ...w,
      provinces: w.provinces.map((p) => ({ ...p, isLand: false })),
    };
    expect(() => pickStartGroup(sea)).toThrow(/no_start_province/);
  });
});

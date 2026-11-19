import { beforeAll, describe, expect, it } from 'vitest';
import { computeAdjacency, STRAIT_MAX_WATER } from '../../../src/sim/world/adjacency';
import { generateWorld } from '../../../src/sim/world/generateWorld';
import { defaultParams } from '../../../src/sim/world/params';
import type { World } from '../../../src/sim/world/types';
import { SEA_LEVEL } from '../../../src/content/terrainLevels';
import { MAJOR_RIVER } from './provinceMetrics';

const key = (a: number, b: number): string => `${Math.min(a, b)}:${Math.max(a, b)}`;

/** Number of border cell pairs per province pair key. */
function borderPairs(world: World): { length: Map<string, number> } {
  const { w, h, provinceOf } = world;
  const length = new Map<string, number>();
  const visit = (i: number, j: number): void => {
    const p = provinceOf[i]!;
    const q = provinceOf[j]!;
    if (p === q) return;
    const k = key(p, q);
    length.set(k, (length.get(k) ?? 0) + 1);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x < w - 1) visit(i, i + 1);
      if (y < h - 1) visit(i, i + w);
    }
  }
  return { length };
}

/** Border pairs where both cells are land without a major river, per province pair key. */
function freePairs(world: World): Map<string, number> {
  const { w, h, height, riverMask, provinceOf } = world;
  const free = (i: number): boolean => height[i]! > SEA_LEVEL && riverMask[i]! < MAJOR_RIVER;
  const out = new Map<string, number>();
  const visit = (i: number, j: number): void => {
    const a = provinceOf[i]!;
    const b = provinceOf[j]!;
    if (a !== b && free(i) && free(j)) out.set(key(a, b), (out.get(key(a, b)) ?? 0) + 1);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < w - 1) visit(y * w + x, y * w + x + 1);
      if (y < h - 1) visit(y * w + x, (y + 1) * w + x);
    }
  }
  return out;
}

/**
 * Crossings over major rivers per province pair key: rays right and down from a free land cell
 * through 1..8 major-river cells (land, riverMask ≥ 2) to a free land cell of another province.
 */
function crossings(world: Pick<World, 'w' | 'h' | 'height' | 'riverMask' | 'provinceOf'>): Map<string, number> {
  const { w, h, height, riverMask, provinceOf } = world;
  const major = (i: number): boolean => height[i]! > SEA_LEVEL && riverMask[i]! >= MAJOR_RIVER;
  const free = (i: number): boolean => height[i]! > SEA_LEVEL && riverMask[i]! < MAJOR_RIVER;
  const out = new Map<string, number>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!free(i)) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        let cx = x + dx;
        let cy = y + dy;
        let n = 0;
        while (cx < w && cy < h && major(cy * w + cx) && n <= 8) {
          n++;
          cx += dx;
          cy += dy;
        }
        if (n === 0 || n > 8 || cx >= w || cy >= h || !free(cy * w + cx)) continue;
        const a = provinceOf[i]!;
        const b = provinceOf[cy * w + cx]!;
        if (a !== b) out.set(key(a, b), (out.get(key(a, b)) ?? 0) + 1);
      }
    }
  }
  return out;
}

describe('adjacency edges (seed "1")', () => {
  let world: World;
  let pairs: ReturnType<typeof borderPairs>;
  beforeAll(() => {
    world = generateWorld(defaultParams('1'));
    pairs = borderPairs(world);
  }, 60000);

  it('a < b, no duplicates; edgesOf gives the edge indices of a province', () => {
    const seen = new Set<string>();
    world.adjacency.forEach((e, i) => {
      expect(e.a).toBeLessThan(e.b);
      expect(e.b).toBeLessThan(world.provinces.length);
      const k = key(e.a, e.b);
      expect(seen.has(k)).toBe(false);
      seen.add(k);
      expect(world.edgesOf[e.a]).toContain(i);
      expect(world.edgesOf[e.b]).toContain(i);
    });
    expect(world.edgesOf.length).toBe(world.provinces.length);
    const total = world.edgesOf.reduce((s, list) => s + list.length, 0);
    expect(total).toBe(world.adjacency.length * 2);
  });

  it('length equals the number of border cell pairs; neighbours from neighbors are exactly the edges with length > 0', () => {
    const touching = world.adjacency.filter((e) => e.length > 0);
    expect(touching.length).toBe(pairs.length.size);
    for (const e of touching) expect(e.length).toBe(pairs.length.get(key(e.a, e.b)));
    const byKey = new Set(world.adjacency.map((e) => key(e.a, e.b)));
    for (const p of world.provinces) for (const q of p.neighbors) expect(byKey.has(key(p.id, q))).toBe(true);
  });

  it('river ⇔ the border crosses a major river (geometric ray check)', () => {
    // Independent of the implementation: an axial ray from a free land cell A through 1..8 major-river
    // cells into a free land cell B is a crossing A→B. River edges have crossings; an edge with at least
    // half its border length in crossings is a river, unless the provinces mostly touch over land
    // (more than half of the border pairs are "land without river | land without river"): then the river
    // separates them somewhere off to the side, and the border does not run along it.
    const cross = crossings(world);
    const landPairs = freePairs(world);
    const landEdges = world.adjacency.filter(
      (e) => e.length > 0 && world.provinces[e.a]!.isLand && world.provinces[e.b]!.isLand,
    );
    // The exception is a corner joint: a border of 2 pairs, one "river | bank" and one dry. A diagonal
    // river passes through the corner, and an axial ray does not cross it, although by the rule
    // 2·riverLength ≥ length the edge is a river. On seed "1" there are 2 of them: province pairs
    // 246–1607 and 979–3415 (both length 2, riverLength 1; they appeared after the biome climate
    // jitter in task 6). There are no more than 3, so the exception does not hide a regression.
    const corner = (e: (typeof landEdges)[number]): boolean => e.length === 2 && e.riverLength === 1;
    const riverNoCrossing = landEdges.filter((e) => e.river && !cross.get(key(e.a, e.b)));
    expect(riverNoCrossing.filter((e) => !corner(e)).map((e) => [e.a, e.b, e.length])).toEqual([]);
    expect(riverNoCrossing.filter(corner).length).toBeLessThanOrEqual(3);
    const missed = landEdges.filter(
      (e) =>
        !e.river &&
        2 * (cross.get(key(e.a, e.b)) ?? 0) >= e.length &&
        2 * (landPairs.get(key(e.a, e.b)) ?? 0) <= e.length,
    );
    expect(missed.map((e) => [e.a, e.b, e.length, cross.get(key(e.a, e.b))])).toEqual([]);
    expect(landEdges.filter((e) => e.river).length).toBeGreaterThan(50);
  });

  it('riverLength — "river | non-river" pairs on land–land edges, 0 on the others; river = 2·riverLength ≥ length', () => {
    for (const e of world.adjacency) {
      const land = world.provinces[e.a]!.isLand && world.provinces[e.b]!.isLand;
      if (!land || e.length === 0) expect(e.riverLength).toBe(0);
      expect(e.riverLength).toBeLessThanOrEqual(e.length);
      expect(e.river).toBe(e.riverLength > 0 && 2 * e.riverLength >= e.length);
    }
  });

  it('straits exist only between land provinces without a shared border', () => {
    const straits = world.adjacency.filter((e) => e.strait);
    expect(straits.length).toBeGreaterThan(0);
    for (const e of straits) {
      expect(world.provinces[e.a]!.isLand && world.provinces[e.b]!.isLand).toBe(true);
      expect(e.length).toBe(0);
      expect(e.river).toBe(false);
    }
    // Edges without a shared border can only be straits.
    expect(world.adjacency.filter((e) => e.length === 0 && !e.strait)).toEqual([]);
  });
});

/**
 * Synthetic map: water (province 0) and two 4×4 square islands (provinces 1 and 2) on one
 * row, with `gap` cells of water between them horizontally.
 */
function islands(gap: number, dy = 0): { provinceOf: Uint16Array; height: Float32Array; w: number; h: number } {
  const w = 30;
  const h = 14;
  const provinceOf = new Uint16Array(w * h);
  const height = new Float32Array(w * h).fill(0.3);
  const put = (x0: number, y0: number, id: number): void => {
    for (let y = y0; y < y0 + 4; y++) {
      for (let x = x0; x < x0 + 4; x++) {
        provinceOf[y * w + x] = id;
        height[y * w + x] = 0.6;
      }
    }
  };
  put(3, 4, 1);
  put(3 + 4 + gap, 4 + dy, 2);
  return { provinceOf, height, w, h };
}

function edgesFor(gap: number, dy = 0): ReturnType<typeof computeAdjacency>['adjacency'] {
  const m = islands(gap, dy);
  const provinces = [{ isLand: false }, { isLand: true }, { isLand: true }];
  return computeAdjacency(m.provinceOf, provinces, m.height, new Uint8Array(m.w * m.h), m.w, m.h).adjacency;
}

describe('straits on a synthetic map', () => {
  it(`strait width — up to ${STRAIT_MAX_WATER} cells of water`, () => {
    expect(STRAIT_MAX_WATER).toBe(3);
  });

  it('two islands across 2 cells of water — a strait', () => {
    const e = edgesFor(2).find((x) => x.a === 1 && x.b === 2);
    expect(e).toEqual({ a: 1, b: 2, length: 0, riverLength: 0, river: false, strait: true });
  });

  it('across 3 cells — a strait, across 4 and 5 — not', () => {
    expect(edgesFor(3).some((x) => x.a === 1 && x.b === 2 && x.strait)).toBe(true);
    expect(edgesFor(4).some((x) => x.a === 1 && x.b === 2)).toBe(false);
    expect(edgesFor(5).some((x) => x.a === 1 && x.b === 2)).toBe(false);
  });

  it('islands offset diagonally (corner to corner across 2 diagonal cells) — a strait', () => {
    // The second island is 4 + 2 rows lower: the nearest shore cells are corners, 2 cells of water diagonally.
    expect(edgesFor(2, 6).some((x) => x.a === 1 && x.b === 2 && x.strait)).toBe(true);
  });

  it('edges of an island with the sea: the length is the island perimeter', () => {
    const list = edgesFor(5);
    expect(list.find((x) => x.a === 0 && x.b === 1)).toEqual({ a: 0, b: 1, length: 16, riverLength: 0, river: false, strait: false });
  });
});

/**
 * Synthetic 20×12 map, all land: a vertical major river 2 cells wide (x = 9, 10).
 * The left bank is provinces 0 (y < 6) and 1 (y ≥ 6); river cells are given to the left bank, as in
 * assignCorridor; the right bank (x ≥ 11) is province 2.
 */
describe('rivers on a synthetic map', () => {
  const w = 20;
  const h = 12;
  const provinceOf = new Uint16Array(w * h);
  const height = new Float32Array(w * h).fill(0.6);
  const riverMask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      provinceOf[i] = x >= 11 ? 2 : y < 6 ? 0 : 1;
      if (x === 9 || x === 10) riverMask[i] = 2;
    }
  }
  const provinces = [{ isLand: true }, { isLand: true }, { isLand: true }];
  const { adjacency } = computeAdjacency(provinceOf, provinces, height, riverMask, w, h);
  const edge = (a: number, b: number): (typeof adjacency)[number] | undefined =>
    adjacency.find((e) => e.a === a && e.b === b);

  it('provinces on opposite banks of a 2-wide river — river, riverLength equals the border length', () => {
    expect(edge(0, 2)).toEqual({ a: 0, b: 2, length: 6, riverLength: 6, river: true, strait: false });
    expect(edge(1, 2)).toEqual({ a: 1, b: 2, length: 6, riverLength: 6, river: true, strait: false });
  });

  it('provinces on the same bank at a river — not river, riverLength = 0', () => {
    expect(edge(0, 1)).toEqual({ a: 0, b: 1, length: 11, riverLength: 0, river: false, strait: false });
  });

  it('the ray check finds crossings exactly on the edges across a river', () => {
    const cross = crossings({ w, h, height, riverMask, provinceOf });
    expect([...cross.keys()].sort()).toEqual(['0:2', '1:2']);
  });

  it('a narrow stream (riverMask 1) does not count as a river', () => {
    const thin = riverMask.map((v) => (v > 0 ? 1 : 0));
    const e = computeAdjacency(provinceOf, provinces, height, thin, w, h).adjacency.find((x) => x.a === 0 && x.b === 2);
    expect(e).toEqual({ a: 0, b: 2, length: 6, riverLength: 0, river: false, strait: false });
  });
});

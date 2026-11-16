import { beforeAll, describe, expect, it } from 'vitest';
import { createRng } from '../../../src/sim/rng';
import { generateHeight } from '../../../src/sim/world/heightmap';
import { computeClimate } from '../../../src/sim/world/climate';
import { computeBiomes } from '../../../src/sim/world/biomes';
import { computeRivers } from '../../../src/sim/world/rivers';
import { computeProvinces } from '../../../src/sim/world/provinces';
import { BIOMES, SEA_LEVEL, WORLD_H, WORLD_W, type Province } from '../../../src/sim/world/types';

const W = WORLD_W;
const H = WORLD_H;

interface Fixture {
  height: Float32Array;
  biomes: Uint8Array;
  riverMask: Uint8Array;
  provinceOf: Uint16Array;
  provinces: Province[];
  /** 1 = land after islands smaller than 6 cells become shallow water. */
  land: Uint8Array;
}

/** Land mask with 4-connected islands of fewer than 6 cells turned into water. */
function effectiveLand(height: Float32Array): Uint8Array {
  const n = W * H;
  const land = new Uint8Array(n);
  for (let i = 0; i < n; i++) land[i] = height[i]! > SEA_LEVEL ? 1 : 0;
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  const comp: number[] = [];
  for (let s = 0; s < n; s++) {
    if (!land[s] || seen[s]) continue;
    seen[s] = 1;
    stack.push(s);
    comp.length = 0;
    while (stack.length) {
      const c = stack.pop()!;
      comp.push(c);
      const x = c % W;
      const y = (c - x) / W;
      const nb = [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, y > 0 ? c - W : -1, y < H - 1 ? c + W : -1];
      for (const d of nb) {
        if (d >= 0 && land[d] && !seen[d]) {
          seen[d] = 1;
          stack.push(d);
        }
      }
    }
    if (comp.length < 6) for (const c of comp) land[c] = 0;
  }
  return land;
}

function build(seed: string): Fixture {
  const rng = createRng(seed);
  const height = generateHeight(rng.fork('height'), W, H);
  const { temperature, moisture } = computeClimate(rng.fork('climate'), height, W, H);
  const biomes = computeBiomes(height, temperature, moisture);
  const { riverMask } = computeRivers(height, moisture, W, H);
  const { provinceOf, provinces } = computeProvinces(rng.fork('provinces'), height, biomes, riverMask, W, H);
  return { height, biomes, riverMask, provinceOf, provinces, land: effectiveLand(height) };
}

/** Real 4-adjacency between provinces, as sorted id lists. */
function realNeighbors(f: Fixture): number[][] {
  const sets = f.provinces.map(() => new Set<number>());
  const { provinceOf } = f;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const p = provinceOf[i]!;
      if (x < W - 1) {
        const q = provinceOf[i + 1]!;
        if (q !== p) {
          sets[p]!.add(q);
          sets[q]!.add(p);
        }
      }
      if (y < H - 1) {
        const q = provinceOf[i + W]!;
        if (q !== p) {
          sets[p]!.add(q);
          sets[q]!.add(p);
        }
      }
    }
  }
  return sets.map((s) => [...s].sort((a, b) => a - b));
}

describe.each(['1', 'Бета-7', 'tiny-islands'])('provinces (seed %j)', (seed) => {
  let f: Fixture;
  beforeAll(() => {
    f = build(seed);
  }, 60000);

  it('has sane land and sea province counts, ids equal indices', () => {
    const land = f.provinces.filter((p) => p.isLand).length;
    const sea = f.provinces.length - land;
    expect(land).toBeGreaterThanOrEqual(2000);
    expect(land).toBeLessThanOrEqual(4000);
    expect(sea).toBeGreaterThanOrEqual(150);
    expect(sea).toBeLessThanOrEqual(600);
    expect(f.provinces.length).toBeLessThanOrEqual(65535);
    f.provinces.forEach((p, i) => expect(p.id).toBe(i));
  });

  it('assigns every cell; cellCount matches; land and water never mix', () => {
    const counts = new Int32Array(f.provinces.length);
    let bad = 0;
    for (let i = 0; i < W * H; i++) {
      const p = f.provinceOf[i]!;
      if (p >= f.provinces.length) throw new Error(`cell ${i} has invalid province ${p}`);
      counts[p] = counts[p]! + 1;
      if ((f.land[i] === 1) !== f.provinces[p]!.isLand) bad++;
    }
    expect(bad).toBe(0);
    f.provinces.forEach((p, i) => expect(p.cellCount).toBe(counts[i]));
  });

  it('every province is 4-connected', () => {
    const { provinceOf } = f;
    const seen = new Uint8Array(W * H);
    const comps = new Int32Array(f.provinces.length);
    const stack: number[] = [];
    for (let s = 0; s < W * H; s++) {
      if (seen[s]) continue;
      const p = provinceOf[s]!;
      comps[p] = comps[p]! + 1;
      seen[s] = 1;
      stack.push(s);
      while (stack.length) {
        const c = stack.pop()!;
        const x = c % W;
        const y = (c - x) / W;
        if (x > 0 && !seen[c - 1] && provinceOf[c - 1] === p) {
          seen[c - 1] = 1;
          stack.push(c - 1);
        }
        if (x < W - 1 && !seen[c + 1] && provinceOf[c + 1] === p) {
          seen[c + 1] = 1;
          stack.push(c + 1);
        }
        if (y > 0 && !seen[c - W] && provinceOf[c - W] === p) {
          seen[c - W] = 1;
          stack.push(c - W);
        }
        if (y < H - 1 && !seen[c + W] && provinceOf[c + W] === p) {
          seen[c + W] = 1;
          stack.push(c + W);
        }
      }
    }
    const broken = [...comps].filter((c) => c !== 1).length;
    expect(broken).toBe(0);
  });

  it('land provinces have >= 40 cells unless they are islands without land neighbours', () => {
    const small = f.provinces.filter(
      (p) => p.isLand && p.cellCount < 40 && p.neighbors.some((q) => f.provinces[q]!.isLand),
    );
    expect(small.map((p) => p.id)).toEqual([]);
  });

  it('neighbors are symmetric and match real cell adjacency', () => {
    const real = realNeighbors(f);
    let mismatched = 0;
    f.provinces.forEach((p, i) => {
      const got = [...p.neighbors].sort((a, b) => a - b);
      if (JSON.stringify(got) !== JSON.stringify(real[i])) mismatched++;
      for (const q of p.neighbors) expect(f.provinces[q]!.neighbors).toContain(i);
    });
    expect(mismatched).toBe(0);
  });

  it('coastal is true exactly for land provinces bordering a sea province', () => {
    for (const p of f.provinces) {
      const expected = p.isLand && p.neighbors.some((q) => !f.provinces[q]!.isLand);
      expect(p.coastal).toBe(expected);
    }
  });

  it('biome is the most frequent biome of the province cells', () => {
    const k = BIOMES.length;
    const counts = new Int32Array(f.provinces.length * k);
    for (let i = 0; i < W * H; i++) {
      const j = f.provinceOf[i]! * k + f.biomes[i]!;
      counts[j] = counts[j]! + 1;
    }
    let wrong = 0;
    f.provinces.forEach((p, i) => {
      let max = 0;
      for (let b = 0; b < k; b++) max = Math.max(max, counts[i * k + b]!);
      if (counts[i * k + BIOMES.indexOf(p.biome)]! !== max) wrong++;
    });
    expect(wrong).toBe(0);
  });

  it('center lies inside the province', () => {
    for (const p of f.provinces) {
      expect(f.provinceOf[Math.floor(p.center.y) * W + Math.floor(p.center.x)]).toBe(p.id);
    }
  });

  it.runIf(seed === '1')('is deterministic', () => {
    const rng = createRng(seed);
    const again = computeProvinces(rng.fork('provinces'), f.height, f.biomes, f.riverMask, W, H);
    expect(Buffer.from(again.provinceOf.buffer).equals(Buffer.from(f.provinceOf.buffer))).toBe(true);
    expect(again.provinces).toEqual(f.provinces);
  });
});

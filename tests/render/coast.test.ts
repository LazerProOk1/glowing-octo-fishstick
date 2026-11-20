import { beforeAll, describe, expect, it } from 'vitest';
import { bakeWorld, coastHeight, displayProvinceOf, displaySeaProvinceOf } from '../../src/render/bakeWorld';
import { pickProvince, softProvince, type ProvinceMaps } from '../../src/render/softProvince';
import { generateWorld } from '../../src/sim/world/generateWorld';
import { defaultParams } from '../../src/sim/world/params';
import type { Province, World } from '../../src/sim/world/types';

/** Whether a cell (itself or one of the 8 neighbours) has coast > 0 — the cell may be visible as land. */
function nearVisibleLand(coast: Float32Array, w: number, h: number, i: number): boolean {
  const x = i % w;
  const y = (i - x) / w;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && coast[ny * w + nx]! > 0) return true;
    }
  }
  return false;
}

/** One world (seed "1", small) for all tests in the file: generation takes a second or two. */
let world: World;
beforeAll(() => {
  const p = defaultParams('1');
  p.options.size = 'small';
  world = generateWorld(p);
}, 60000);

describe('displayProvinceOf', () => {
  it('visible land picks a land province (seed "1", small)', () => {
    const { w, h, provinces, provinceOf } = world;
    const coast = coastHeight(world.height, w, h);
    const shown = displayProvinceOf(world, coast);
    expect(shown.length).toBe(w * h);
    let visibleWater = 0;
    let landChanged = 0;
    let farChanged = 0;
    let changed = 0;
    for (let i = 0; i < w * h; i++) {
      const own = provinceOf[i]!;
      if (coast[i]! > 0 && !provinces[shown[i]!]!.isLand) visibleWater++;
      if (provinces[own]!.isLand && shown[i] !== own) landChanged++;
      if (shown[i] !== own) {
        changed++;
        if (!nearVisibleLand(coast, w, h, i)) farChanged++;
      }
    }
    expect(visibleWater).toBe(0);
    expect(landChanged).toBe(0);
    expect(farChanged).toBe(0);
    expect(changed).toBeGreaterThan(0);
  }, 60000);

  it('the water strip at the shore goes to the nearest land, ties to the lower id', () => {
    // 6×1: land 1 | water 0 0 0 0 | land 2; all the water is visible land (coast > 0).
    const w = 6;
    const h = 1;
    const provinces = [{ isLand: false }, { isLand: true }, { isLand: true }] as Province[];
    const provinceOf = new Uint16Array([1, 0, 0, 0, 0, 2]);
    const tiny = { w, h, provinces, provinceOf } as unknown as World;
    const shown = displayProvinceOf(tiny, new Float32Array(w).fill(0.01));
    expect(Array.from(shown)).toEqual([1, 1, 1, 2, 2, 2]);
    const odd = displayProvinceOf(
      { w: 5, h, provinces, provinceOf: new Uint16Array([2, 0, 0, 0, 1]) } as unknown as World,
      new Float32Array(5).fill(0.01),
    );
    expect(Array.from(odd)).toEqual([2, 2, 1, 1, 1]);
  });

  it('water with no visible land nearby keeps its own province', () => {
    const w = 8;
    const provinces = [{ isLand: false }, { isLand: true }] as Province[];
    const provinceOf = new Uint16Array([1, 0, 0, 0, 0, 0, 0, 0]);
    const coast = new Float32Array([0.1, 0.01, -0.01, -0.1, -0.1, -0.1, -0.1, -0.1]);
    const shown = displayProvinceOf({ w, h: 1, provinces, provinceOf } as unknown as World, coast);
    // Cell 1 is "land" on screen itself, cell 2 is its neighbour; beyond that it is water.
    expect(Array.from(shown)).toEqual([1, 1, 1, 0, 0, 0, 0, 0]);
  });

  it('a strip cut off from all land keeps its own province', () => {
    // Cells 4..6 form a strip around the visible-land cell 5, but no land cell touches the strip.
    const provinces = [{ isLand: false }, { isLand: true }] as Province[];
    const provinceOf = new Uint16Array([1, 0, 0, 0, 0, 0, 0]);
    const coast = new Float32Array([-0.1, -0.1, -0.1, -0.1, -0.1, 0.1, -0.1]);
    const shown = displayProvinceOf({ w: 7, h: 1, provinces, provinceOf } as unknown as World, coast);
    expect(Array.from(shown)).toEqual([1, 0, 0, 0, 0, 0, 0]);
  });
});

/** Whether a cell (itself or one of the 8 neighbours) has coast < 0 — the cell may be visible as water. */
function nearVisibleWater(coast: Float32Array, w: number, h: number, i: number): boolean {
  const x = i % w;
  const y = (i - x) / w;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && coast[ny * w + nx]! < 0) return true;
    }
  }
  return false;
}

/** The earlier walk implementation (seeded from the whole source side): the reference for the optimisation. */
function referenceSpread(world: World, coast: Float32Array, toLand: boolean): Uint16Array {
  const { w, h, provinces, provinceOf } = world;
  const n = w * h;
  const out = provinceOf.slice();
  const sourceOf = provinces.map((p) => (p.isLand === toLand ? 1 : 0));
  const sign = toLand ? 1 : -1;
  const state = new Uint8Array(n);
  let frontier: number[] = [];
  for (let i = 0; i < n; i++) {
    if (sourceOf[provinceOf[i]!]) {
      frontier.push(i);
      continue;
    }
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && sign * coast[ny * w + nx]! > 0) state[i] = 1;
      }
    }
  }
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const i of frontier) {
      const id = out[i]!;
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (state[j] === 1) {
            state[j] = 2;
            out[j] = id;
            next.push(j);
          } else if (state[j] === 2 && id < out[j]!) {
            out[j] = id;
          }
        }
      }
    }
    for (const j of next) state[j] = 3;
    frontier = next;
  }
  return out;
}

describe('display map walk', () => {
  it('seeding only from the strip gives the same result as walking from the whole side (seed "1", small)', () => {
    const coast = coastHeight(world.height, world.w, world.h);
    expect(displayProvinceOf(world, coast)).toEqual(referenceSpread(world, coast, true));
    expect(displaySeaProvinceOf(world, coast)).toEqual(referenceSpread(world, coast, false));
  }, 60000);
});

describe('displaySeaProvinceOf', () => {
  it('visible water picks a water province (seed "1", small)', () => {
    const { w, h, provinces, provinceOf } = world;
    const coast = coastHeight(world.height, w, h);
    const shown = displaySeaProvinceOf(world, coast);
    expect(shown.length).toBe(w * h);
    let visibleLand = 0;
    let waterChanged = 0;
    let farChanged = 0;
    let changed = 0;
    for (let i = 0; i < w * h; i++) {
      const own = provinceOf[i]!;
      if (coast[i]! < 0 && provinces[shown[i]!]!.water === null) visibleLand++;
      if (provinces[own]!.water !== null && shown[i] !== own) waterChanged++;
      if (shown[i] !== own) {
        changed++;
        if (!nearVisibleWater(coast, w, h, i)) farChanged++;
      }
    }
    expect(visibleLand).toBe(0);
    expect(waterChanged).toBe(0);
    expect(farChanged).toBe(0);
    expect(changed).toBeGreaterThan(0);
  }, 60000);

  it('the land strip at the water goes to the nearest water, ties to the lower id', () => {
    // 6×1: water 1 | land 0 0 0 0 | water 2; all the land may be visible as water (coast < 0).
    const provinces = [
      { isLand: true, water: null },
      { isLand: false, water: 'sea' },
      { isLand: false, water: 'lake' },
    ] as Province[];
    const provinceOf = new Uint16Array([1, 0, 0, 0, 0, 2]);
    const tiny = { w: 6, h: 1, provinces, provinceOf } as unknown as World;
    expect(Array.from(displaySeaProvinceOf(tiny, new Float32Array(6).fill(-0.01)))).toEqual([1, 1, 1, 2, 2, 2]);
  });
});

/** Maps for picking: the id in R,G, land in B (like provinceRG). */
function rg(ids: number[], land: (id: number) => boolean): Uint8Array {
  const out = new Uint8Array(ids.length * 4);
  ids.forEach((id, i) => out.set([id & 255, id >> 8, land(id) ? 255 : 0, 255], i * 4));
  return out;
}

describe('province picking on the CPU (as in the shader)', () => {
  it('a point on water at the shore gives a water province, on land a land one (seed "1", small)', () => {
    const bake = bakeWorld(world);
    const { w, h, provinces } = world;
    const coast = coastHeight(world.height, w, h);
    const maps: ProvinceMaps = { w, h, land: bake.provinceRG, sea: bake.provinceSeaRG, surface: bake.surface };
    let water = 0;
    let land = 0;
    let wrong = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const c = coast[i]!;
        // Cell centre: the bilinear shore height there equals the cell's own value.
        if (c < -1e-3 && nearVisibleLand(coast, w, h, i)) {
          water++;
          const id = pickProvince(maps, x + 0.5, y + 0.5);
          if (id === null || provinces[id]!.water === null) wrong++;
        } else if (c > 1e-3 && nearVisibleWater(coast, w, h, i)) {
          land++;
          const id = pickProvince(maps, x + 0.5, y + 0.5);
          if (id === null || !provinces[id]!.isLand) wrong++;
        }
      }
    }
    expect(water).toBeGreaterThan(100);
    expect(land).toBeGreaterThan(100);
    expect(wrong).toBe(0);
  }, 60000);

  it('the border along a diagonal cell staircase is smooth', () => {
    // Land: province 1 where x + y ≤ 20 (in cells), otherwise 2. The ideal border is x + y = 21.5.
    const w = 32;
    const h = 32;
    const ids: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ids.push(x + y <= 20 ? 1 : 2);
    const map = rg(ids, () => true);
    const surface = new Uint16Array(w * h * 4).fill(0x3c00); // coast = 1.0: land everywhere
    const maps: ProvinceMaps = { w, h, land: map, sea: map, surface };
    let worst = 0;
    for (let s = 6; s <= 15; s += 0.05) {
      // A point on the ideal line: x + y = 21.5.
      const x = s;
      const y = 21.5 - s;
      const r = softProvince(maps, x, y);
      // Distance to the border in cells: about zero on the ideal line.
      worst = Math.max(worst, Math.abs(r.edge));
      expect(pickProvince(maps, x - 0.1, y - 0.1)).toBe(1);
      expect(pickProvince(maps, x + 0.1, y + 0.1)).toBe(2);
    }
    expect(worst).toBeLessThan(0.05);
  });
});

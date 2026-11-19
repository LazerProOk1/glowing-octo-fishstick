import { beforeAll, describe, expect, it } from 'vitest';
import { SEA_LEVEL } from '../../../src/content/terrainLevels';
import { labelComponents } from '../../../src/sim/geom/label';
import { generateWorld } from '../../../src/sim/world/generateWorld';
import { findLakes, LAKE_MAX_CELLS } from '../../../src/sim/world/lakes';
import { defaultParams } from '../../../src/sim/world/params';
import { MIN_SEA_CELLS } from '../../../src/sim/world/provinces';
import type { World } from '../../../src/sim/world/types';

const LAND = SEA_LEVEL + 0.1;
const WATER = SEA_LEVEL - 0.1;

/** Land w×h with a water rim `rim` cells thick. */
function island(w: number, h: number, rim: number): Float32Array {
  const height = new Float32Array(w * h).fill(LAND);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < rim || y < rim || x >= w - rim || y >= h - rim) height[y * w + x] = WATER;
    }
  }
  return height;
}

function fillRect(height: Float32Array, w: number, x0: number, y0: number, rw: number, rh: number, v: number): void {
  for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) height[y * w + x] = v;
}

describe('findLakes', () => {
  it('lake is inland water', () => {
    const w = 64;
    const h = 32;
    const height = island(w, h, 2);
    fillRect(height, w, 27, 11, 10, 10, WATER);
    const lakes = findLakes(height, w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const pond = x >= 27 && x < 37 && y >= 11 && y < 21;
        expect(lakes[y * w + x], `${x},${y}`).toBe(pond ? 1 : 0);
      }
    }
  });

  it('water touching the map edge is never a lake', () => {
    const w = 64;
    const h = 32;
    const height = new Float32Array(w * h).fill(LAND);
    // A bay reaching from the top edge into the land.
    fillRect(height, w, 20, 0, 12, 20, WATER);
    // The same water body, but it touches the edge with one cell: also not a lake.
    fillRect(height, w, 45, 10, 8, 8, WATER);
    fillRect(height, w, 63, 13, 1, 1, WATER);
    fillRect(height, w, 53, 13, 10, 1, WATER);
    expect(findLakes(height, w, h).every((v) => v === 0)).toBe(true);
  });

  it('huge inland water is sea', () => {
    const w = 100;
    const h = 100;
    const height = island(w, h, 1);
    // 81×81 = 6561 > LAKE_MAX_CELLS, with a pond within the threshold next to it.
    fillRect(height, w, 3, 3, 81, 81, WATER);
    fillRect(height, w, 87, 3, 10, 10, WATER);
    expect(81 * 81).toBeGreaterThan(LAKE_MAX_CELLS);
    const lakes = findLakes(height, w, h);
    expect(lakes[50 * w + 50]).toBe(0);
    expect(lakes[5 * w + 90]).toBe(1);
    let n = 0;
    for (const v of lakes) n += v;
    expect(n).toBe(100);
  });

  it('a lake of exactly LAKE_MAX_CELLS is still a lake', () => {
    const w = 100;
    const h = 100;
    const height = island(w, h, 1);
    fillRect(height, w, 3, 3, 75, 80, WATER);
    expect(75 * 80).toBe(LAKE_MAX_CELLS);
    expect(findLakes(height, w, h)[40 * w + 40]).toBe(1);
  });
});

describe('lake provinces (seed "1", medium)', () => {
  let world: World;
  let lake: Uint8Array;
  beforeAll(() => {
    world = generateWorld(defaultParams('1'));
    lake = findLakes(world.height, world.w, world.h);
  }, 60000);

  it('a lake province has only lake cells and the lake biome; lake and sea do not mix', () => {
    const lakeCode = world.biomes.findIndex((b) => b.id === 'lake');
    expect(lakeCode).toBeGreaterThanOrEqual(0);
    const n = world.w * world.h;
    const lakeCells = new Int32Array(world.provinces.length);
    // Lake cells, and only they, carry the lake biome.
    let wrongBiome = 0;
    for (let i = 0; i < n; i++) {
      if (lake[i]) lakeCells[world.provinceOf[i]!]!++;
      if ((world.biome[i] === lakeCode) !== (lake[i] === 1)) wrongBiome++;
    }
    expect(wrongBiome).toBe(0);
    let lakes = 0;
    for (const p of world.provinces) {
      if (p.isLand) {
        expect(p.water).toBeNull();
        expect(lakeCells[p.id]).toBe(0);
      } else if (p.water === 'lake') {
        lakes++;
        expect(p.biome).toBe('lake');
        expect(lakeCells[p.id]).toBe(p.cellCount);
      } else {
        expect(p.water).toBe('sea');
        expect(lakeCells[p.id]).toBe(0);
      }
    }
    expect(lakes).toBeGreaterThan(0);
  });

  it('coastal only for the sea, lakeside only for a lake', () => {
    const ps = world.provinces;
    let lakeOnly = 0;
    for (const p of ps) {
      const sea = p.neighbors.some((q) => ps[q]!.water === 'sea');
      const lakeNb = p.neighbors.some((q) => ps[q]!.water === 'lake');
      expect(p.coastal, `провинция ${p.id}`).toBe(p.isLand && sea);
      expect(p.lakeside, `провинция ${p.id}`).toBe(p.isLand && lakeNb);
      if (p.isLand && lakeNb && !sea) {
        lakeOnly++;
        expect(p.coastal).toBe(false);
        expect(p.lakeside).toBe(true);
      }
    }
    expect(lakeOnly).toBeGreaterThan(0);
  });

  it('a lake smaller than the minimum sea province is one province', () => {
    const { w, h } = world;
    const { comp, sizes } = labelComponents(lake, w, h);
    const owner = new Map<number, Set<number>>();
    for (let i = 0; i < w * h; i++) {
      if (!lake[i]) continue;
      const k = comp[i]!;
      let s = owner.get(k);
      if (!s) owner.set(k, (s = new Set()));
      s.add(world.provinceOf[i]!);
    }
    for (const [k, s] of owner) if (sizes[k]! < MIN_SEA_CELLS) expect(s.size, `озеро ${k}`).toBe(1);
  });
});

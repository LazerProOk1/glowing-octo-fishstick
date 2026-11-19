import { beforeAll, describe, expect, it } from 'vitest';
import { generateWorld } from '../../../src/sim/world/generateWorld';
import { defaultParams, type WorldParams, type WorldSize } from '../../../src/sim/world/params';
import type { World } from '../../../src/sim/world/types';
import { provinceBounds } from './provinceMetrics';

function paramsOf(seed: string, size: WorldSize): WorldParams {
  const p = defaultParams(seed);
  return { ...p, options: { ...p.options, size } };
}

function counts(world: World): { land: number; sea: number } {
  const land = world.provinces.filter((p) => p.isLand).length;
  return { land, sea: world.provinces.length - land };
}

describe('small world size', () => {
  let world: World;
  beforeAll(() => {
    world = generateWorld(paramsOf('1', 'small'));
  }, 60000);

  it('sizes come from the preset, the params are stored in the world', () => {
    expect([world.w, world.h]).toEqual([1024, 512]);
    expect(world.height.length).toBe(1024 * 512);
    expect(world.provinceOf.length).toBe(1024 * 512);
    expect(world.params.options.size).toBe('small');
  });

  it('the province count is proportional to the land and sea area', () => {
    const b = provinceBounds(world.height, world.w, world.h);
    const c = counts(world);
    expect(c.land).toBeGreaterThanOrEqual(b.land[0]);
    expect(c.land).toBeLessThanOrEqual(b.land[1]);
    expect(c.sea).toBeGreaterThanOrEqual(b.sea[0]);
    expect(c.sea).toBeLessThanOrEqual(b.sea[1]);
  });

  it('every cell belongs to a province, the edges are built', () => {
    let max = 0;
    for (const v of world.provinceOf) if (v > max) max = v;
    expect(max).toBe(world.provinces.length - 1);
    expect(world.adjacency.length).toBeGreaterThan(world.provinces.length);
  });
});

// A large world takes ~10 s to generate; run: WORLD_LARGE=1 npx vitest run tests/sim/world/size.test.ts
describe.skipIf(!process.env.WORLD_LARGE)('large world size (smoke test)', () => {
  it('it generates, provinces are within bounds, ids fit in uint16', { timeout: 120000 }, () => {
    const world = generateWorld(paramsOf('1', 'large'));
    expect([world.w, world.h]).toEqual([3072, 1536]);
    const b = provinceBounds(world.height, world.w, world.h);
    const c = counts(world);
    expect(c.land).toBeGreaterThanOrEqual(b.land[0]);
    expect(c.land).toBeLessThanOrEqual(b.land[1]);
    expect(world.provinces.length).toBeLessThanOrEqual(65535);
  });
});

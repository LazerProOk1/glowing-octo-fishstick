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

describe('размер мира small', () => {
  let world: World;
  beforeAll(() => {
    world = generateWorld(paramsOf('1', 'small'));
  }, 60000);

  it('размеры из пресета, параметры записаны в мир', () => {
    expect([world.w, world.h]).toEqual([1024, 512]);
    expect(world.height.length).toBe(1024 * 512);
    expect(world.provinceOf.length).toBe(1024 * 512);
    expect(world.params.options.size).toBe('small');
  });

  it('число провинций пропорционально площади суши и моря', () => {
    const b = provinceBounds(world.height, world.w, world.h);
    const c = counts(world);
    expect(c.land).toBeGreaterThanOrEqual(b.land[0]);
    expect(c.land).toBeLessThanOrEqual(b.land[1]);
    expect(c.sea).toBeGreaterThanOrEqual(b.sea[0]);
    expect(c.sea).toBeLessThanOrEqual(b.sea[1]);
  });

  it('каждая клетка принадлежит провинции, рёбра построены', () => {
    let max = 0;
    for (const v of world.provinceOf) if (v > max) max = v;
    expect(max).toBe(world.provinces.length - 1);
    expect(world.adjacency.length).toBeGreaterThan(world.provinces.length);
  });
});

// Большой мир генерируется ~10 с; запуск: WORLD_LARGE=1 npx vitest run tests/sim/world/size.test.ts
describe.skipIf(!process.env.WORLD_LARGE)('размер мира large (дымовой тест)', () => {
  it('генерируется, провинций в пределах, id влезают в uint16', { timeout: 120000 }, () => {
    const world = generateWorld(paramsOf('1', 'large'));
    expect([world.w, world.h]).toEqual([3072, 1536]);
    const b = provinceBounds(world.height, world.w, world.h);
    const c = counts(world);
    expect(c.land).toBeGreaterThanOrEqual(b.land[0]);
    expect(c.land).toBeLessThanOrEqual(b.land[1]);
    expect(world.provinces.length).toBeLessThanOrEqual(65535);
  });
});

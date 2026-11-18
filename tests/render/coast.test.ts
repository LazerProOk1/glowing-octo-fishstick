import { describe, expect, it } from 'vitest';
import { coastHeight, displayProvinceOf } from '../../src/render/bakeWorld';
import { generateWorld } from '../../src/sim/world/generateWorld';
import { defaultParams } from '../../src/sim/world/params';
import type { Province, World } from '../../src/sim/world/types';

/** Есть ли у клетки (она сама или 8 соседей) значение coast > 0 — клетка может быть видна сушей. */
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

describe('displayProvinceOf', () => {
  it('visible land picks a land province (сид "1", small)', () => {
    const p = defaultParams('1');
    p.options.size = 'small';
    const world = generateWorld(p);
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

  it('полоса воды у берега достаётся ближайшей суше, при равенстве — меньшему id', () => {
    // 6×1: суша 1 | вода 0 0 0 0 | суша 2; вся вода — видимая суша (coast > 0).
    const w = 6;
    const h = 1;
    const provinces = [{ isLand: false }, { isLand: true }, { isLand: true }] as Province[];
    const provinceOf = new Uint16Array([1, 0, 0, 0, 0, 2]);
    const world = { w, h, provinces, provinceOf } as unknown as World;
    const shown = displayProvinceOf(world, new Float32Array(w).fill(0.01));
    expect(Array.from(shown)).toEqual([1, 1, 1, 2, 2, 2]);
    const odd = displayProvinceOf(
      { w: 5, h, provinces, provinceOf: new Uint16Array([2, 0, 0, 0, 1]) } as unknown as World,
      new Float32Array(5).fill(0.01),
    );
    expect(Array.from(odd)).toEqual([2, 2, 1, 1, 1]);
  });

  it('вода без видимой суши рядом остаётся своей провинцией', () => {
    const w = 8;
    const provinces = [{ isLand: false }, { isLand: true }] as Province[];
    const provinceOf = new Uint16Array([1, 0, 0, 0, 0, 0, 0, 0]);
    const coast = new Float32Array([0.1, 0.01, -0.01, -0.1, -0.1, -0.1, -0.1, -0.1]);
    const shown = displayProvinceOf({ w, h: 1, provinces, provinceOf } as unknown as World, coast);
    // Клетка 1 сама «суша» на экране, клетка 2 — её сосед; дальше вода.
    expect(Array.from(shown)).toEqual([1, 1, 1, 0, 0, 0, 0, 0]);
  });
});

import { describe, expect, it } from 'vitest';
import { bakeWorld, coastHeight, displayProvinceOf, displaySeaProvinceOf } from '../../src/render/bakeWorld';
import { pickProvince, softProvince, type ProvinceMaps } from '../../src/render/softProvince';
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

/** Есть ли у клетки (она сама или 8 соседей) значение coast < 0 — клетка может быть видна водой. */
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

describe('displaySeaProvinceOf', () => {
  it('visible water picks a water province (сид "1", small)', () => {
    const p = defaultParams('1');
    p.options.size = 'small';
    const world = generateWorld(p);
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

  it('полоса суши у воды достаётся ближайшей воде, при равенстве — меньшему id', () => {
    // 6×1: вода 1 | суша 0 0 0 0 | вода 2; вся суша может быть видна водой (coast < 0).
    const provinces = [
      { isLand: true, water: null },
      { isLand: false, water: 'sea' },
      { isLand: false, water: 'lake' },
    ] as Province[];
    const provinceOf = new Uint16Array([1, 0, 0, 0, 0, 2]);
    const world = { w: 6, h: 1, provinces, provinceOf } as unknown as World;
    expect(Array.from(displaySeaProvinceOf(world, new Float32Array(6).fill(-0.01)))).toEqual([1, 1, 1, 2, 2, 2]);
  });
});

/** Карты для выбора: id в R,G, суша в B (как provinceRG). */
function rg(ids: number[], land: (id: number) => boolean): Uint8Array {
  const out = new Uint8Array(ids.length * 4);
  ids.forEach((id, i) => out.set([id & 255, id >> 8, land(id) ? 255 : 0, 255], i * 4));
  return out;
}

describe('выбор провинции на CPU (как в шейдере)', () => {
  it('точка на воде у берега даёт водную провинцию, на суше — сухопутную (сид "1", small)', () => {
    const p = defaultParams('1');
    p.options.size = 'small';
    const world = generateWorld(p);
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
        // Центр клетки: билинейная высота берега там равна значению самой клетки.
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

  it('граница по диагональной лесенке клеток гладкая', () => {
    // Суша: провинция 1 там, где x + y ≤ 20 (по клеткам), иначе 2. Идеальная граница — x + y = 21.5.
    const w = 32;
    const h = 32;
    const ids: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ids.push(x + y <= 20 ? 1 : 2);
    const map = rg(ids, () => true);
    const surface = new Uint16Array(w * h * 4).fill(0x3c00); // coast = 1.0: везде суша
    const maps: ProvinceMaps = { w, h, land: map, sea: map, surface };
    let worst = 0;
    for (let s = 6; s <= 15; s += 0.05) {
      // Точка на идеальной линии: x + y = 21.5.
      const x = s;
      const y = 21.5 - s;
      const r = softProvince(maps, x, y);
      // Расстояние до границы в клетках: на идеальной линии — около нуля.
      worst = Math.max(worst, Math.abs(r.edge));
      expect(pickProvince(maps, x - 0.1, y - 0.1)).toBe(1);
      expect(pickProvince(maps, x + 0.1, y + 0.1)).toBe(2);
    }
    expect(worst).toBeLessThan(0.05);
  });
});

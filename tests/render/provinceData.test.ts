import { describe, expect, it } from 'vitest';
import type { MapMode } from '../../src/render/mapModes';
import { PROVINCE_FLAGS, ProvinceData, provinceDataLayout } from '../../src/render/provinceData';
import type { Province, World } from '../../src/sim/world/types';

function province(id: number, isLand: boolean): Province {
  return { id, isLand, water: isLand ? null : 'sea', cellCount: 1, center: { x: 0, y: 0 }, biome: 'plains', neighbors: [], coastal: false, lakeside: false };
}

function fakeWorld(n: number): World {
  return { provinces: Array.from({ length: n }, (_, i) => province(i, i % 2 === 0)) } as unknown as World;
}

describe('раскладка текстуры данных провинций', () => {
  it('одна строка, пока помещается; иначе строки по maxSize', () => {
    expect(provinceDataLayout(10, 2048)).toEqual({ width: 10, height: 1 });
    expect(provinceDataLayout(2048, 2048)).toEqual({ width: 2048, height: 1 });
    expect(provinceDataLayout(2049, 2048)).toEqual({ width: 2048, height: 2 });
    expect(provinceDataLayout(0, 2048)).toEqual({ width: 1, height: 1 });
  });

  it('слишком много провинций — ошибка', () => {
    expect(() => provinceDataLayout(5, 2)).toThrow();
  });
});

describe('ProvinceData', () => {
  it('set пишет тексель и копит один грязный диапазон', () => {
    const d = new ProvinceData(10, 4);
    expect(d.takeDirty()).toBeNull();
    d.set(7, [1, 2, 3, 4]);
    d.set(2, [5, 6, 7, 8]);
    expect([...d.data.subarray(28, 32)]).toEqual([1, 2, 3, 4]);
    expect([...d.data.subarray(8, 12)]).toEqual([5, 6, 7, 8]);
    expect(d.takeDirty()).toEqual({ start: 2, end: 8 });
    expect(d.takeDirty()).toBeNull();
  });

  it('set вне диапазона id — ошибка', () => {
    const d = new ProvinceData(3, 4);
    expect(() => d.set(3, [0, 0, 0, 0])).toThrow();
    expect(() => d.set(-1, [0, 0, 0, 0])).toThrow();
  });

  it('applyMode: цвет и флаг FILL, null — без заливки; флаги состояния сохраняются; грязное сброшено', () => {
    const world = fakeWorld(4);
    const d = new ProvinceData(4, 4);
    d.set(1, [9, 9, 9, PROVINCE_FLAGS.UNEXPLORED | PROVINCE_FLAGS.TARGET]);
    const mode: MapMode = {
      id: 'test',
      nameKey: 'mapMode.provinces',
      color: (p) => (p.isLand ? [10 + p.id, 20, 30, 0] : null),
    };
    const anyFill = d.applyMode(mode, world);
    expect(anyFill).toBe(true);
    expect([...d.data.subarray(0, 4)]).toEqual([10, 20, 30, PROVINCE_FLAGS.FILL]);
    expect([...d.data.subarray(4, 8)]).toEqual([0, 0, 0, PROVINCE_FLAGS.UNEXPLORED | PROVINCE_FLAGS.TARGET]);
    expect([...d.data.subarray(8, 12)]).toEqual([12, 20, 30, PROVINCE_FLAGS.FILL]);
    expect(d.takeDirty()).toBeNull();

    const none: MapMode = { id: 'none', nameKey: 'mapMode.terrain', color: () => null };
    expect(d.applyMode(none, world)).toBe(false);
    expect(d.data[3]).toBe(0);
  });
});

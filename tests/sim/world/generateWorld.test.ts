import { beforeAll, describe, expect, it } from 'vitest';
import { assertProvinceCount, generateWorld } from '../../../src/sim/world/generateWorld';
import { WORLD_H, WORLD_W, type World } from '../../../src/sim/world/types';

describe('assertProvinceCount', () => {
  it('65536 бросает, 65535 нет', () => {
    expect(() => assertProvinceCount(65536)).toThrow('слишком много провинций');
    expect(() => assertProvinceCount(65535)).not.toThrow();
  });
});

describe('generateWorld', () => {
  let a: World;
  let b: World;
  let ms = 0;
  beforeAll(() => {
    const t = performance.now();
    a = generateWorld('Бета-7');
    ms = performance.now() - t;
    b = generateWorld('Бета-7');
    console.log(`generateWorld ms: ${ms.toFixed(0)}`);
  }, 60000);

  it('размеры и согласованность', () => {
    expect(a.w).toBe(WORLD_W);
    expect(a.h).toBe(WORLD_H);
    expect(a.seed).toBe('Бета-7');
    expect(a.provinceOf.length).toBe(WORLD_W * WORLD_H);
    expect(a.provinces.length).toBeGreaterThan(0);
  });

  it('детерминирован: массивы побайтно равны', () => {
    const eq = (x: ArrayBufferView, y: ArrayBufferView): boolean =>
      Buffer.compare(
        Buffer.from(x.buffer, x.byteOffset, x.byteLength),
        Buffer.from(y.buffer, y.byteOffset, y.byteLength),
      ) === 0;
    expect(eq(a.height, b.height)).toBe(true);
    expect(eq(a.temperature, b.temperature)).toBe(true);
    expect(eq(a.moisture, b.moisture)).toBe(true);
    expect(eq(a.biome, b.biome)).toBe(true);
    expect(eq(a.riverMask, b.riverMask)).toBe(true);
    expect(eq(a.provinceOf, b.provinceOf)).toBe(true);
    expect(JSON.stringify(a.rivers)).toBe(JSON.stringify(b.rivers));
    expect(JSON.stringify(a.provinces)).toBe(JSON.stringify(b.provinces));
  });

  it('генерация меньше 8 с', () => {
    expect(ms).toBeLessThan(8000);
  });
});

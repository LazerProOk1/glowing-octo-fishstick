import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertProvinceCount,
  GEN_STAGES,
  generateWorld,
  type GenStage,
} from '../../../src/sim/world/generateWorld';
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
  let c: World;
  const stages: GenStage[] = [];
  let surface: { height: Float32Array; biome: Uint8Array; stagesBefore: number } | null = null;
  beforeAll(() => {
    const t = performance.now();
    a = generateWorld(
      'Бета-7',
      (s) => stages.push(s),
      (height, biome) => (surface = { height, biome, stagesBefore: stages.length }),
    );
    ms = performance.now() - t;
    b = generateWorld('Бета-7');
    c = generateWorld('другое-зерно');
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

  it('согласованность provinces и provinceOf', () => {
    a.provinces.forEach((p, i) => expect(p.id).toBe(i));
    let max = 0;
    for (const v of a.provinceOf) if (v > max) max = v;
    expect(max).toBeLessThan(a.provinces.length);
  });

  it('другое зерно даёт другой мир', () => {
    expect(Buffer.from(c.provinceOf.buffer).equals(Buffer.from(a.provinceOf.buffer))).toBe(false);
  });

  it('onStage вызывается перед каждым из 6 этапов по порядку', () => {
    expect(GEN_STAGES).toEqual(['height', 'climate', 'biomes', 'shoreline', 'rivers', 'provinces']);
    expect(stages).toEqual([...GEN_STAGES]);
  });

  it('onSurface получает окончательные высоту и биомы сразу после этапа берегов', () => {
    expect(surface).not.toBeNull();
    expect(surface!.height).toBe(a.height);
    expect(surface!.biome).toBe(a.biome);
    expect(surface!.stagesBefore).toBe(GEN_STAGES.indexOf('shoreline') + 1);
  });

  it('генерация укладывается в грубую границу', () => {
    // Дымовая граница: в node под нагрузкой время скачет. Бюджет спецификации (≤ 8 с в воркере)
    // проверяется в браузере по таймингам этапов в панели отладки (F3).
    expect(ms).toBeLessThan(12000);
  });
});

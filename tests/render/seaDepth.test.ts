import { describe, expect, it } from 'vitest';
import { SEA_LEVEL } from '../../src/content/terrainLevels';
import { SEA_DEPTH_MAX, SEA_DEPTH_STEP, depthTone, seaDepthSize, smoothSeaDepth } from '../../src/render/seaDepth';

describe('depthTone', () => {
  it('0 у берега, 1 на самом дне, вне диапазона обрезается', () => {
    expect(depthTone(0)).toBe(0);
    expect(depthTone(SEA_DEPTH_MAX)).toBeCloseTo(1, 10);
    expect(depthTone(-0.1)).toBe(0);
    expect(depthTone(SEA_DEPTH_MAX * 2)).toBeCloseTo(1, 10);
  });

  it('половина перехода на первых 25% глубины', () => {
    expect(depthTone(0.25 * SEA_DEPTH_MAX)).toBeCloseTo(0.5, 10);
  });

  it('монотонно растёт', () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const v = depthTone((i / 100) * SEA_DEPTH_MAX);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});

describe('smoothSeaDepth', () => {
  const w = 512;
  const h = 256;
  const size = seaDepthSize(w, h);
  /** Мир из функции глубины (клетка → глубина, ≤ 0 — суша). */
  const world = (depth: (x: number, y: number) => number): Float32Array => {
    const a = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = SEA_LEVEL - depth(x, y);
    return a;
  };
  /** Значение поля в узле, ближайшем к клетке (x, y). */
  const at = (f: Float32Array, x: number, y: number): number =>
    f[Math.floor(y / SEA_DEPTH_STEP) * size.w + Math.floor(x / SEA_DEPTH_STEP)] as number;

  it('сетка в SEA_DEPTH_STEP раз меньше карты', () => {
    expect(smoothSeaDepth(world(() => 0.3), w, h).length).toBe(size.w * size.h);
  });

  it('крупный рельеф дна сохраняется: котловина и подъём с периодом 512 клеток', () => {
    const f = smoothSeaDepth(world((x) => 0.25 + 0.15 * Math.cos((2 * Math.PI * x) / w)), w, h);
    // Без сглаживания разница 0.3; после — не меньше 75% от неё.
    expect(at(f, 2, 128) - at(f, 256, 128)).toBeGreaterThan(0.22);
  });

  it('два дна, отличающиеся только мелким шумом, дают почти одно и то же поле', () => {
    const base = (x: number, y: number): number => 0.25 + 0.1 * Math.sin(x / 90) * Math.cos(y / 70);
    const noisy = (x: number, y: number): number =>
      base(x, y) + 0.04 * Math.sin(x * 0.9 + y * 0.4) + 0.03 * Math.sin(y * 0.7 - x * 0.3) + 0.03 * Math.sin(x / 6 + y / 5);
    const a = smoothSeaDepth(world(base), w, h);
    const b = smoothSeaDepth(world(noisy), w, h);
    let maxDiff = 0;
    for (let i = 0; i < a.length; i++) maxDiff = Math.max(maxDiff, Math.abs((a[i] as number) - (b[i] as number)));
    expect(maxDiff).toBeLessThan(0.01);
  });

  it('маленький остров в глубокой котловине не даёт отмели', () => {
    const island = (x: number, y: number): boolean => Math.abs(x - 256) < 3 && Math.abs(y - 128) < 3;
    const f = smoothSeaDepth(world((x, y) => (island(x, y) ? -0.1 : 0.4)), w, h);
    // Уже в узле рядом с островом (4–8 клеток) глубина та же, что в открытой котловине.
    expect(at(f, 264, 128)).toBeCloseTo(0.4, 4);
    expect(at(f, 256, 136)).toBeCloseTo(0.4, 4);
    expect(at(f, 20, 20)).toBeCloseTo(0.4, 4);
  });

  it('широкое мелкое плато даёт широкую светлую область', () => {
    const plateau = (x: number, y: number): boolean => Math.abs(x - 256) < 100 && Math.abs(y - 128) < 80;
    const f = smoothSeaDepth(world((x, y) => (plateau(x, y) ? 0.03 : 0.45)), w, h);
    // В центре и в 50 клетках от края плато внутрь — мелко (светлый тон), далеко за краем — глубоко.
    expect(depthTone(at(f, 256, 128))).toBeLessThan(0.2);
    expect(depthTone(at(f, 306, 128))).toBeLessThan(0.3);
    expect(depthTone(at(f, 256, 98))).toBeLessThan(0.3);
    expect(depthTone(at(f, 20, 128))).toBeGreaterThan(0.9);
  });
});

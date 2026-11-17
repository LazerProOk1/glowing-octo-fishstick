import { describe, expect, it } from 'vitest';
import { bakeGradient } from '../../src/render/normals';

const W = 32;
const H = 16;

function field(fn: (x: number, y: number) => number): Float32Array {
  const a = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a[y * W + x] = fn(x, y);
  return a;
}

describe('bakeGradient', () => {
  it('ровное поле даёт нулевой градиент', () => {
    const g = bakeGradient(field(() => 0.6), W, H);
    expect(g).toHaveLength(W * H * 2);
    for (const v of g) expect(Math.abs(v)).toBeLessThan(1e-6);
  });

  it('наклонная плоскость даёт постоянный градиент в её направлении', () => {
    // h = 0.01·x + 0.02·y: градиент (0.01, 0.02) на клетку.
    const g = bakeGradient(field((x, y) => 0.01 * x + 0.02 * y), W, H);
    for (let y = 6; y < H - 6; y++) {
      for (let x = 6; x < W - 6; x++) {
        const o = (y * W + x) * 2;
        expect(g[o]).toBeCloseTo(0.01, 6);
        expect(g[o + 1]).toBeCloseTo(0.02, 6);
      }
    }
  });

  it('на краях и для шума результат конечен', () => {
    let s = 1;
    const rnd = (): number => ((s = (s * 16807) % 2147483647) / 2147483647);
    const g = bakeGradient(field(() => rnd()), W, H);
    for (const v of g) expect(Number.isFinite(v)).toBe(true);
  });

  it('сглаживание убирает излом ступеньки', () => {
    // Ступенька по x: Собель без размытия дал бы градиент только в 2 столбцах.
    const g = bakeGradient(field((x) => (x < W / 2 ? 0 : 1)), W, H);
    const row = 8;
    const nonZero = [];
    for (let x = 0; x < W; x++) if ((g[(row * W + x) * 2] as number) > 1e-3) nonZero.push(x);
    expect(nonZero.length).toBeGreaterThanOrEqual(5);
  });
});

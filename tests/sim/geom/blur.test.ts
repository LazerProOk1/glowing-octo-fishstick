import { describe, expect, it } from 'vitest';
import { blur, gaussianKernel } from '../../../src/sim/geom/blur';
import { createRng } from '../../../src/sim/rng';

describe('gaussianKernel', () => {
  it('сумма 1, радиус ceil(3σ), симметрия', () => {
    const k = gaussianKernel(1.25);
    expect(k.length).toBe(2 * Math.ceil(3 * 1.25) + 1);
    let s = 0;
    for (const v of k) s += v;
    expect(s).toBeCloseTo(1, 6);
    for (let i = 0; i < k.length; i++) expect(k[i]).toBe(k[k.length - 1 - i]);
  });
});

describe('blur', () => {
  it('сохраняет сумму на случайном поле 64×32 (1e-4)', () => {
    const w = 64;
    const h = 32;
    const sigma = 1.5;
    // Обрезка у краёв дублирует крайние клетки, поэтому случайные значения лежат не ближе
    // радиуса ядра к краю: вся масса остаётся внутри карты.
    const pad = Math.ceil(3 * sigma) + 1;
    const rng = createRng('blur-sum');
    const src = new Float32Array(w * h);
    for (let y = pad; y < h - pad; y++) {
      for (let x = pad; x < w - pad; x++) src[y * w + x] = rng.next();
    }
    const out = blur(src, w, h, sigma);
    let a = 0;
    let b = 0;
    for (const v of src) a += v;
    for (const v of out) b += v;
    expect(a).toBeGreaterThan(100);
    expect(Math.abs(a - b) / a).toBeLessThan(1e-4);
  });

  it('постоянное поле не меняется', () => {
    const out = blur(new Float32Array(20 * 10).fill(0.25), 20, 10, 2);
    for (const v of out) expect(v).toBeCloseTo(0.25, 6);
  });
});

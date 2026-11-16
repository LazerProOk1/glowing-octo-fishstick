import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/sim/rng';
import { createNoise2D, fbm } from '../../src/sim/noise';

describe('noise', () => {
  it('noise range and determinism', () => {
    const n1 = createNoise2D(createRng('n'));
    const n2 = createNoise2D(createRng('n'));
    const pr = createRng('points');
    for (let i = 0; i < 10000; i++) {
      const x = pr.next() * 200 - 100;
      const y = pr.next() * 200 - 100;
      const v = n1(x, y);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBe(n2(x, y));
    }
  });

  it('is not constant', () => {
    const n = createNoise2D(createRng('n'));
    const vals = new Set<number>();
    for (let i = 0; i < 50; i++) vals.add(n(i * 0.37, i * 0.11));
    expect(vals.size).toBeGreaterThan(10);
  });

  it('fbm stays normalized and deterministic', () => {
    const n = createNoise2D(createRng('f'));
    for (let i = 0; i < 2000; i++) {
      const v = fbm(n, i * 0.13, i * 0.07, 5);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(v).toBe(fbm(n, i * 0.13, i * 0.07, 5));
    }
  });
});

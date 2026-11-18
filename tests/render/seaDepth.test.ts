import { describe, expect, it } from 'vitest';
import { SEA_DEPTH_MAX, depthTone } from '../../src/render/seaDepth';

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

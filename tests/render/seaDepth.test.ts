import { describe, expect, it } from 'vitest';
import { SEA_DEPTH_MAX, depthTone, smoothSeaDepth } from '../../src/render/seaDepth';

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
  // Остров 10×10 в центре моря 160×120 с шумным дном.
  const w = 160;
  const h = 120;
  const height = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const island = x >= 75 && x < 85 && y >= 55 && y < 65;
      height[y * w + x] = island ? 0.6 : 0.3 + 0.15 * (((x * 7 + y * 13) % 5) / 4);
    }
  }
  const d = smoothSeaDepth(height, w, h);

  it('вдали от суши дно ровное, на наибольшей глубине', () => {
    for (const [x, y] of [[0, 0], [5, 110], [150, 10]] as const) {
      expect(d[y * w + x]).toBeCloseTo(SEA_DEPTH_MAX, 5);
    }
  });

  it('у берега отмель: мельче, чем в паре десятков клеток от него', () => {
    const at = (x: number): number => d[60 * w + x] as number;
    expect(at(86)).toBeLessThan(at(100));
    expect(at(100)).toBeLessThan(at(140));
  });

  it('шум дна сглажен', () => {
    const row = 60 * w;
    expect(Math.abs((d[row + 100] as number) - (d[row + 101] as number))).toBeLessThan(0.01);
  });
});

import { describe, expect, it } from 'vitest';
import { SEA_LEVEL } from '../../src/content/terrainLevels';
import { MAP_FRAGMENT } from '../../src/render/mapShader';
import {
  DEPTH_TONE_K,
  SEA_DEPTH_MAX,
  SEA_DEPTH_STEP,
  WATER_GRAIN,
  depthTone,
  seaDepthSize,
  smoothSeaDepth,
} from '../../src/render/seaDepth';

describe('depthTone', () => {
  it('0 at the shore, 1 at the very bottom, out-of-range values are clamped', () => {
    expect(depthTone(0)).toBe(0);
    expect(depthTone(SEA_DEPTH_MAX)).toBeCloseTo(1, 10);
    expect(depthTone(-0.1)).toBe(0);
    expect(depthTone(SEA_DEPTH_MAX * 2)).toBeCloseTo(1, 10);
  });

  it('half of the transition falls on the first 25% of the depth', () => {
    expect(depthTone(0.25 * SEA_DEPTH_MAX)).toBeCloseTo(0.5, 10);
  });

  it('grows monotonically', () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const v = depthTone((i / 100) * SEA_DEPTH_MAX);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});

describe('depthTone and the map shader', () => {
  const f = (n: number): string => n.toFixed(4);

  it('GLSL has the same K, depth and water grain constants, and the same formula', () => {
    expect(MAP_FRAGMENT).toContain(`const float TONE_K = ${f(DEPTH_TONE_K)};`);
    expect(MAP_FRAGMENT).toContain(`const float DEPTH_MAX = ${f(SEA_DEPTH_MAX)};`);
    expect(MAP_FRAGMENT).toContain(`const float WATER_GRAIN = ${f(WATER_GRAIN)};`);
    // TS: t·(1 + K)/(t + K).
    expect(MAP_FRAGMENT).toContain('t * (1.0 + TONE_K) / (t + TONE_K)');
  });

  it('the TS formula gives the value of the GLSL formula with the same constants', () => {
    const k = Number(f(DEPTH_TONE_K));
    for (const t of [0, 0.1, 0.25, 0.6, 1]) {
      expect(depthTone(t * SEA_DEPTH_MAX)).toBeCloseTo((t * (1 + k)) / (t + k), 4);
    }
  });
});

describe('smoothSeaDepth', () => {
  const w = 512;
  const h = 256;
  const size = seaDepthSize(w, h);
  /** A world from a depth function (cell → depth, ≤ 0 — land). */
  const world = (depth: (x: number, y: number) => number): Float32Array => {
    const a = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = SEA_LEVEL - depth(x, y);
    return a;
  };
  /** Field value at the node nearest to cell (x, y). */
  const at = (f: Float32Array, x: number, y: number): number =>
    f[Math.floor(y / SEA_DEPTH_STEP) * size.w + Math.floor(x / SEA_DEPTH_STEP)] as number;

  it('the grid is SEA_DEPTH_STEP times smaller than the map', () => {
    expect(smoothSeaDepth(world(() => 0.3), w, h).length).toBe(size.w * size.h);
  });

  it('large bottom relief is preserved: a basin and a rise with a 512-cell period', () => {
    const f = smoothSeaDepth(world((x) => 0.25 + 0.15 * Math.cos((2 * Math.PI * x) / w)), w, h);
    // Without smoothing the difference is 0.3; afterwards — at least 75% of it.
    expect(at(f, 2, 128) - at(f, 256, 128)).toBeGreaterThan(0.22);
  });

  it('two bottoms differing only in fine noise give almost the same field', () => {
    const base = (x: number, y: number): number => 0.25 + 0.1 * Math.sin(x / 90) * Math.cos(y / 70);
    const noisy = (x: number, y: number): number =>
      base(x, y) + 0.04 * Math.sin(x * 0.9 + y * 0.4) + 0.03 * Math.sin(y * 0.7 - x * 0.3) + 0.03 * Math.sin(x / 6 + y / 5);
    const a = smoothSeaDepth(world(base), w, h);
    const b = smoothSeaDepth(world(noisy), w, h);
    let maxDiff = 0;
    for (let i = 0; i < a.length; i++) maxDiff = Math.max(maxDiff, Math.abs((a[i] as number) - (b[i] as number)));
    expect(maxDiff).toBeLessThan(0.01);
  });

  it('a small island in a deep basin produces no shoal', () => {
    const island = (x: number, y: number): boolean => Math.abs(x - 256) < 3 && Math.abs(y - 128) < 3;
    const f = smoothSeaDepth(world((x, y) => (island(x, y) ? -0.1 : 0.4)), w, h);
    // Already at a node near the island (4–8 cells) the depth is the same as in the open basin.
    expect(at(f, 264, 128)).toBeCloseTo(0.4, 4);
    expect(at(f, 256, 136)).toBeCloseTo(0.4, 4);
    expect(at(f, 20, 20)).toBeCloseTo(0.4, 4);
  });

  it('a wide shallow plateau gives a wide bright area', () => {
    const plateau = (x: number, y: number): boolean => Math.abs(x - 256) < 100 && Math.abs(y - 128) < 80;
    const f = smoothSeaDepth(world((x, y) => (plateau(x, y) ? 0.03 : 0.45)), w, h);
    // At the centre and 50 cells inside the plateau edge it is shallow (bright tint), far outside it is deep.
    expect(depthTone(at(f, 256, 128))).toBeLessThan(0.2);
    expect(depthTone(at(f, 306, 128))).toBeLessThan(0.3);
    expect(depthTone(at(f, 256, 98))).toBeLessThan(0.3);
    expect(depthTone(at(f, 20, 128))).toBeGreaterThan(0.9);
  });
});

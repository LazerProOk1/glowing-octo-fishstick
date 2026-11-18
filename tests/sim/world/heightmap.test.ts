import { describe, expect, it } from 'vitest';
import { createRng } from '../../../src/sim/rng';
import { generateHeight, countLandmasses } from '../../../src/sim/world/heightmap';
import { SIZE_PRESETS } from '../../../src/sim/world/params';
import { SEA_LEVEL, MOUNTAIN_LEVEL, HILL_LEVEL } from '../../../src/sim/world/types';

const { w: WORLD_W, h: WORLD_H } = SIZE_PRESETS.medium;

const SEEDS = [...Array.from({ length: 17 }, (_, i) => String(i + 1)), '', 'Бета-7', 'worldbox'];

describe('size presets and levels', () => {
  it('has constants', () => {
    expect(SIZE_PRESETS.small).toEqual({ w: 1024, h: 512 });
    expect(SIZE_PRESETS.large).toEqual({ w: 3072, h: 1536 });
    expect(WORLD_W).toBe(2048);
    expect(WORLD_H).toBe(1024);
    expect(SEA_LEVEL).toBe(0.5);
  });
});

describe('generateHeight', () => {
  const w = WORLD_W;
  const h = WORLD_H;

  it.each(SEEDS)('seed %j: plausible world', (seed) => {
    const hm = generateHeight(createRng(seed), w, h);
    expect(hm.length).toBe(w * h);
    let land = 0;
    let min = 1;
    let max = 0;
    for (let i = 0; i < hm.length; i++) {
      const v = hm[i] ?? 0;
      if (v > SEA_LEVEL) land++;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(1);
    const frac = land / hm.length;
    expect(frac).toBeGreaterThanOrEqual(0.3);
    expect(frac).toBeLessThanOrEqual(0.45);
    expect(countLandmasses(hm, w, h, 20000)).toBeGreaterThanOrEqual(2);

    const B = 8;
    let edge = 0;
    let edgeWater = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x < B || y < B || x >= w - B || y >= h - B) {
          edge++;
          if ((hm[y * w + x] ?? 0) <= SEA_LEVEL) edgeWater++;
        }
      }
    }
    expect(edgeWater / edge).toBeGreaterThanOrEqual(0.95);
  }, 30000);

  it('is deterministic', () => {
    const a = generateHeight(createRng('Бета-7'), w, h);
    const b = generateHeight(createRng('Бета-7'), w, h);
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
  }, 30000);
});

describe('elevation distribution', () => {
  it.each(['1', 'Бета-7'])('seed %j: ranges, not domes or plateaus', (seed) => {
    const hm = generateHeight(createRng(seed), WORLD_W, WORLD_H);
    let land = 0;
    let mtn = 0;
    let hills = 0;
    let low = 0;
    for (const v of hm) {
      if (v <= SEA_LEVEL) continue;
      land++;
      if (v > MOUNTAIN_LEVEL) mtn++;
      else if (v > HILL_LEVEL) hills++;
      if (v < 0.55) low++;
    }
    expect(mtn / land).toBeGreaterThanOrEqual(0.015);
    expect(mtn / land).toBeLessThanOrEqual(0.05);
    expect(hills / land).toBeGreaterThanOrEqual(0.08);
    expect(hills / land).toBeLessThanOrEqual(0.18);
    expect(low / land).toBeLessThan(0.25);
  }, 30000);
});

describe('countLandmasses', () => {
  it('counts 4-connected components above minCells', () => {
    const w = 8;
    const h = 4;
    const m = new Float32Array(w * h).fill(0.1);
    // 2x2 block + diagonal-only touching single cell + 1 isolated cell
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 2], [6, 3]] as const) m[y * w + x] = 0.9;
    expect(countLandmasses(m, w, h, 1)).toBe(3);
    expect(countLandmasses(m, w, h, 4)).toBe(1);
  });
});

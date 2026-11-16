import { describe, expect, it } from 'vitest';
import { createRng } from '../../../src/sim/rng';
import { generateHeight } from '../../../src/sim/world/heightmap';
import { computeClimate } from '../../../src/sim/world/climate';
import { computeRivers } from '../../../src/sim/world/rivers';
import { SEA_LEVEL, WORLD_H, WORLD_W } from '../../../src/sim/world/types';

describe.each(['1', 'Бета-7'])('rivers (seed %j)', { timeout: 60000 }, (seed) => {
  const w = WORLD_W;
  const h = WORLD_H;
  const rng = createRng(seed);
  const height = generateHeight(rng.fork('height'), w, h);
  const { moisture } = computeClimate(rng.fork('climate'), height, w, h);
  const { rivers, riverMask } = computeRivers(height, moisture, w, h);
  const cell = (p: { x: number; y: number }): number => Math.floor(p.y) * w + Math.floor(p.x);

  it('has a sane number of rivers', () => {
    expect(rivers.length).toBeGreaterThanOrEqual(15);
    expect(rivers.length).toBeLessThanOrEqual(200);
  });

  it('is deterministic', () => {
    const again = computeRivers(height, moisture, w, h);
    expect(again.rivers).toEqual(rivers);
    expect(Buffer.from(again.riverMask).equals(Buffer.from(riverMask))).toBe(true);
  });

  it('widths are 1..4 and match points; mask is consistent', () => {
    for (const r of rivers) {
      expect(r.width.length).toBe(r.points.length);
      expect(r.points.length).toBeGreaterThanOrEqual(2);
      for (const wd of r.width) {
        expect(wd).toBeGreaterThanOrEqual(1);
        expect(wd).toBeLessThanOrEqual(4);
      }
    }
    let maxMask = 0;
    for (let i = 0; i < riverMask.length; i++) maxMask = Math.max(maxMask, riverMask[i]!);
    expect(maxMask).toBeLessThanOrEqual(4);
    for (const r of rivers) expect(riverMask[cell(r.points[0]!)]!).toBeGreaterThanOrEqual(1);
  });

  it('starts on land, ends in water or joins another river', () => {
    const owner = new Map<number, Set<number>>();
    rivers.forEach((r, ri) => {
      for (const p of r.points) {
        const c = cell(p);
        let s = owner.get(c);
        if (!s) owner.set(c, (s = new Set()));
        s.add(ri);
      }
    });
    rivers.forEach((r, ri) => {
      const first = r.points[0]!;
      const last = r.points[r.points.length - 1]!;
      expect(height[cell(first)]!).toBeGreaterThanOrEqual(SEA_LEVEL);
      const inWater = height[cell(last)]! < SEA_LEVEL;
      const joins = [...(owner.get(cell(last)) ?? [])].some((o) => o !== ri);
      expect(inWater || joins).toBe(true);
    });
  });

  it('height does not rise along a river (tolerance 1e-3)', () => {
    for (const r of rivers) {
      let lowest = Infinity;
      for (const p of r.points) {
        const v = height[cell(p)]!;
        expect(v).toBeLessThanOrEqual(lowest + 1e-3);
        lowest = Math.min(lowest, v);
      }
    }
  });

  it('no point except the last lies in the ocean', () => {
    for (const r of rivers) {
      for (let i = 0; i < r.points.length - 1; i++) {
        expect(height[cell(r.points[i]!)]!).toBeGreaterThanOrEqual(SEA_LEVEL);
      }
    }
  });
});

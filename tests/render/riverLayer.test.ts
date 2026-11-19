import { beforeAll, describe, expect, it } from 'vitest';
import { coastHeight } from '../../src/render/bakeWorld';
import { buildRiverPieces, chaikin, riverWidthCells } from '../../src/render/riverLayer';
import { SEA_LEVEL } from '../../src/content/terrainLevels';
import { generateWorld } from '../../src/sim/world/generateWorld';
import { defaultParams } from '../../src/sim/world/params';
import type { World } from '../../src/sim/world/types';

type P = { x: number; y: number };

/** Point inside a convex polygon (vertices in traversal order, either direction). */
function insideConvex(p: P, hull: P[], eps = 1e-9): boolean {
  let sign = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i] as P;
    const b = hull[(i + 1) % hull.length] as P;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) <= eps) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

describe('chaikin', () => {
  const tri: P[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];

  it('keeps the first and the last point', () => {
    const out = chaikin(tri, 3);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[out.length - 1]).toEqual({ x: 10, y: 10 });
  });

  it('2 iterations on 3 points give 6 points', () => {
    expect(chaikin(tri, 2)).toHaveLength(6);
  });

  it('all points lie within the convex hull of the source points', () => {
    for (const p of chaikin(tri, 4)) expect(insideConvex(p, tri)).toBe(true);
  });

  it('0 iterations and short paths return a copy', () => {
    const out = chaikin(tri, 0);
    expect(out).toEqual(tri);
    expect(out).not.toBe(tri);
    expect(chaikin([{ x: 1, y: 2 }, { x: 3, y: 4 }], 3)).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
  });

  it('does not modify the input array', () => {
    const copy = tri.map((p) => ({ ...p }));
    chaikin(tri, 3);
    expect(tri).toEqual(copy);
  });
});

describe('riverWidthCells', () => {
  it('grows downstream', () => {
    for (const width of [1, 2, 3, 4]) {
      const w = 0.3 + 0.22 * width;
      expect(riverWidthCells(width, 0)).toBeCloseTo(0.35 * w, 10);
      expect(riverWidthCells(width, 1)).toBeCloseTo(w, 10);
      let prev = -Infinity;
      for (let k = 0; k <= 20; k++) {
        const v = riverWidthCells(width, k / 20);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });
});

/** Bilinear field sampling like texture() with clamp-to-edge (cell centres at +0.5), see coastAt. */
function sampler(f: Float32Array, w: number, h: number): (x: number, y: number) => number {
  const at = (ix: number, iy: number): number =>
    f[Math.min(h - 1, Math.max(0, iy)) * w + Math.min(w - 1, Math.max(0, ix))]!;
  return (x, y) => {
    const cx = Math.floor(x - 0.5);
    const cy = Math.floor(y - 0.5);
    const tx = x - 0.5 - cx;
    const ty = y - 0.5 - cy;
    const top = at(cx, cy) * (1 - tx) + at(cx + 1, cy) * tx;
    const bottom = at(cx, cy + 1) * (1 - tx) + at(cx + 1, cy + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };
}

describe.each(['1', 'Бета-7'])('river mouths (seed %j, small)', (seed) => {
  let world: World;
  beforeAll(() => {
    const p = defaultParams(seed);
    p.options.size = 'small';
    world = generateWorld(p);
  }, 60000);

  it('mouth reaches coastline', () => {
    const { w, h, height, rivers } = world;
    const coast = sampler(coastHeight(height, w, h), w, h);
    const pieces = buildRiverPieces(rivers, coast);
    let mouths = 0;
    rivers.forEach((r, ri) => {
      const last = r.points[r.points.length - 1]!;
      if (height[Math.floor(last.y) * w + Math.floor(last.x)]! >= SEA_LEVEL) return; // tributary
      mouths++;
      const water = pieces.filter((p) => p.river === ri && p.kind === 'water');
      const tip = water[water.length - 1]!.points.at(-1)!;
      // The end is in water and no closer than 0.5 cells to the shoreline (zero blurred height): 8 points around.
      expect(coast(tip.x, tip.y), `река ${ri}`).toBeLessThan(0);
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        expect(coast(tip.x + 0.5 * Math.cos(a), tip.y + 0.5 * Math.sin(a)), `река ${ri}`).toBeLessThan(0);
      }
      // The underlay (dark edge) does not enter the water: its end is on land or right at the shoreline.
      const bank = pieces.filter((p) => p.river === ri && p.kind === 'bank');
      const bankEnd = bank[bank.length - 1]!.points.at(-1)!;
      expect(coast(bankEnd.x, bankEnd.y), `река ${ri}`).toBeGreaterThanOrEqual(0);
    });
    expect(mouths).toBeGreaterThan(5);
  });
});

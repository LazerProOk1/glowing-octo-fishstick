import { describe, expect, it } from 'vitest';
import { meander, pinnedPoints } from '../../src/render/riverLayer';
import type { RiverPath } from '../../src/sim/world/types';

type P = { x: number; y: number };

function distToPolyline(p: P, line: P[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i] as P;
    const b = line[i + 1] as P;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}

/** A long D8 path: 40 cells along x, then 30 diagonally. */
function d8(x0: number, y0: number): P[] {
  const pts: P[] = [];
  for (let i = 0; i < 40; i++) pts.push({ x: x0 + i + 0.5, y: y0 + 0.5 });
  for (let i = 1; i <= 30; i++) pts.push({ x: x0 + 39 + i + 0.5, y: y0 + i + 0.5 });
  return pts;
}

describe('meander', () => {
  const main = d8(0, 0);
  const junction = main[20] as P;
  const trib: P[] = [];
  for (let i = 15; i >= 1; i--) trib.push({ x: junction.x, y: junction.y - i });
  trib.push({ ...junction });
  const rivers: RiverPath[] = [
    { points: main, width: main.map(() => 2) },
    { points: trib, width: trib.map(() => 1) },
  ];
  const pinned = pinnedPoints(rivers);

  it('the ends and shared confluence points do not move', () => {
    const m = meander(main, 0, pinned);
    expect(m[0]).toEqual(main[0]);
    expect(m[m.length - 1]).toEqual(main[main.length - 1]);
    expect(m[20]).toEqual(junction);
    const t = meander(trib, 1, pinned);
    expect(t[0]).toEqual(trib[0]);
    expect(t[t.length - 1]).toEqual(junction);
  });

  it('every point stays within 0.4 cells of the original polyline', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const p of meander(main, seed, pinned)) expect(distToPolyline(p, main)).toBeLessThanOrEqual(0.4);
    }
  });

  it('straight stretches really bend', () => {
    // The per-river average of the maximum deviation on a straight 30-cell segment.
    let sum = 0;
    for (let seed = 0; seed < 10; seed++) {
      const m = meander(main, seed, pinned);
      sum += Math.max(...m.slice(4, 17).concat(m.slice(24, 37)).map((p) => Math.abs(p.y - 0.5)));
    }
    expect(sum / 10).toBeGreaterThan(0.1);
  });

  it('is deterministic and depends on the river number', () => {
    expect(meander(main, 5, pinned)).toEqual(meander(main, 5, pinned));
    expect(meander(main, 5, pinned)).not.toEqual(meander(main, 6, pinned));
  });
});

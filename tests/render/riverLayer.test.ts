import { describe, expect, it } from 'vitest';
import { chaikin } from '../../src/render/riverLayer';

type P = { x: number; y: number };

/** Точка внутри выпуклого многоугольника (вершины по обходу, любого направления). */
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

  it('сохраняет первую и последнюю точки', () => {
    const out = chaikin(tri, 3);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[out.length - 1]).toEqual({ x: 10, y: 10 });
  });

  it('2 итерации на 3 точках дают 6 точек', () => {
    expect(chaikin(tri, 2)).toHaveLength(6);
  });

  it('все точки лежат внутри выпуклой оболочки исходных', () => {
    for (const p of chaikin(tri, 4)) expect(insideConvex(p, tri)).toBe(true);
  });

  it('0 итераций и короткие пути возвращают копию', () => {
    const out = chaikin(tri, 0);
    expect(out).toEqual(tri);
    expect(out).not.toBe(tri);
    expect(chaikin([{ x: 1, y: 2 }, { x: 3, y: 4 }], 3)).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
  });

  it('не изменяет входной массив', () => {
    const copy = tri.map((p) => ({ ...p }));
    chaikin(tri, 3);
    expect(tri).toEqual(copy);
  });
});

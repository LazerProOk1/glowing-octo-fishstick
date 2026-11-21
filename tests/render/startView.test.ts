import { describe, expect, it } from 'vitest';
import { startView } from '../../src/render/startView';
import type { World } from '../../src/sim/world/types';

const prov = (id: number, x: number, y: number, neighbors: number[]) => ({
  id,
  center: { x, y },
  cellCount: 100,
  neighbors,
});
const world = {
  w: 1000,
  h: 500,
  provinces: [prov(0, 100, 100, [1]), prov(1, 140, 100, [0]), prov(2, 900, 400, [])],
} as unknown as World;

describe('startView', () => {
  it('centres on the province group and fills the middle third', () => {
    const v = startView(world, [0], 900, 600);
    const r = Math.sqrt(100 / Math.PI);
    expect(v.cell.x).toBeCloseTo(120);
    expect(v.cell.y).toBeCloseTo(100);
    expect(v.zoom).toBeCloseTo(900 / 3 / (40 + 2 * r)); // width is the limiting axis
  });

  it('falls back to the map centre for an unknown province', () => {
    expect(startView(world, [99], 900, 600)).toEqual({ cell: { x: 500, y: 250 }, zoom: 1 });
  });
});

import { describe, expect, it } from 'vitest';
import { startView } from '../../src/render/startView';
import type { World } from '../../src/sim/world/types';

const prov = (id: number, x: number, y: number, neighbors: number[]) => ({
  id,
  center: { x, y },
  cellCount: 100,
  neighbors,
  isLand: true,
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

  it('frames every member of a multi-province group and their neighbours', () => {
    const w = {
      w: 1000,
      h: 500,
      provinces: [prov(0, 100, 100, [1]), prov(1, 140, 100, [0, 2]), prov(2, 180, 100, [1])],
    } as unknown as World;
    const v = startView(w, [0, 1], 900, 600);
    expect(v.cell.x).toBeCloseTo(140); // 0..2 span: province 2 is a neighbour of member 1
  });

  it('ignores sea neighbours when framing', () => {
    const sea = { ...prov(1, 900, 400, [0]), cellCount: 1_000_000, isLand: false };
    const w = { w: 1000, h: 500, provinces: [prov(0, 100, 100, [1]), sea] } as unknown as World;
    const r = Math.sqrt(100 / Math.PI);
    const v = startView(w, [0], 900, 600); // the group alone
    expect(v.cell.x).toBeCloseTo(100);
    expect(v.zoom).toBeCloseTo(600 / 3 / (2 * r)); // height is the limiting axis
  });

  it('falls back to the map centre for an unknown province', () => {
    expect(startView(world, [99], 900, 600)).toEqual({
      cell: { x: 500, y: 250 },
      zoom: 1,
    });
  });
});

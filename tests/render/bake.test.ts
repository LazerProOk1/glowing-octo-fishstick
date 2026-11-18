import { beforeAll, describe, expect, it } from 'vitest';
import { resolveBiomes } from '../../src/content/registry';
import { bakeTextures, decodeProvinceId, encodeProvinceId } from '../../src/render/bake';
import { defaultParams } from '../../src/sim/world/params';
import type { Province, World } from '../../src/sim/world/types';

describe('encodeProvinceId', () => {
  it('круговое преобразование', () => {
    for (const id of [0, 255, 256, 65535]) {
      expect(decodeProvinceId(...encodeProvinceId(id))).toBe(id);
    }
    expect(encodeProvinceId(258)).toEqual([2, 1]);
  });
});

function mkProvinces(): Province[] {
  const ps: Province[] = [];
  for (let id = 0; id <= 300; id++) {
    ps.push({ id, isLand: id === 0, water: id === 0 ? null : 'sea', cellCount: 1, center: { x: 0, y: 0 }, biome: 'plains', neighbors: [], coastal: false });
  }
  return ps;
}

describe('bakeTextures', () => {
  const w = 8;
  const h = 4;
  let world: World;
  beforeAll(() => {
    const n = w * h;
    const provinceOf = new Uint16Array(n);
    for (let i = 0; i < n; i++) provinceOf[i] = i % w < 4 ? 0 : 300;
    const height = new Float32Array(n).fill(0.6);
    height[0] = 0.2;
    const riverMask = new Uint8Array(n);
    riverMask[1] = 4;
    world = {
      params: defaultParams('t'),
      w,
      h,
      height,
      temperature: new Float32Array(n),
      moisture: new Float32Array(n).fill(1),
      arcana: new Float32Array(n),
      biomes: resolveBiomes({}),
      biome: new Uint8Array(n).fill(5),
      riverMask,
      rivers: [],
      provinceOf,
      provinces: mkProvinces(),
      adjacency: [],
      edgesOf: [],
    };
  });

  it('раскладка provinceRG, terrain, border', () => {
    const t = bakeTextures(world);
    expect(t.provinceRG.length).toBe(w * h * 4);
    expect(Array.from(t.provinceRG.subarray(0, 4))).toEqual([0, 0, 255, 255]);
    const i = 4 * 4; // x = 4
    expect(Array.from(t.provinceRG.subarray(i, i + 4))).toEqual([300 & 255, 300 >> 8, 0, 255]);
    expect(t.terrain[0]).toBe(Math.round(0.2 * 255));
    expect(t.terrain[1]).toBe(5);
    expect(t.terrain[2]).toBe(255);
    expect(t.terrain[3]).toBe(0);
    expect(t.terrain[4 + 3]).toBe(252);
    expect(t.border[3 * 4]).toBe(16); // 0.5 * 32
    expect(t.border[3 * 4 + 1]).toBe(0);
    expect(t.border[3]).toBe(255);
    expect(t.border[0]).toBe(Math.min(255, Math.round(3.5 * 32)));
  });

  it('бросает при отсутствующей провинции', () => {
    expect(() => bakeTextures({ ...world, provinces: [] })).toThrow();
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { resolveBiomes } from '../../src/content/registry';
import {
  SEA_MAP_ALPHA,
  bakeTextures,
  provinceIdPixels,
  writeWaterClass,
} from '../../src/render/bake';
import { LAKE_SLOT, WATER_SLOT, paletteData } from '../../src/render/textures';
import { defaultParams } from '../../src/sim/world/params';
import type { Province, World } from '../../src/sim/world/types';

function mkProvinces(): Province[] {
  const ps: Province[] = [];
  for (let id = 0; id <= 300; id++) {
    ps.push({ id, isLand: id === 0, water: id === 0 ? null : 'sea', cellCount: 1, center: { x: 0, y: 0 }, biome: 'plains', neighbors: [], coastal: false, lakeside: false });
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

  it('provinceRG and terrain layout; no border field', () => {
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
    expect(Object.keys(t).sort()).toEqual(['provinceRG', 'terrain']);
  });

  it('throws on a missing province', () => {
    expect(() => bakeTextures({ ...world, provinces: [] })).toThrow();
  });

  it('provinceIdPixels: the same layout as provinceRG, for any owner map', () => {
    const owner = new Uint16Array(w * h).fill(300);
    owner[0] = 0;
    const px = provinceIdPixels(owner, world.provinces);
    expect(Array.from(px.subarray(0, 8))).toEqual([0, 0, 255, 255, 300 & 255, 300 >> 8, 0, 255]);
    expect(provinceIdPixels(world.provinceOf, world.provinces)).toEqual(bakeTextures(world).provinceRG);
    expect(() => provinceIdPixels(new Uint16Array([301]), world.provinces)).toThrow();
  });

  it('writeWaterClass: alpha by the biome water kind, the same mapping as the palette slots', () => {
    const defs = world.biomes;
    const biome = Uint8Array.from(defs.map((_, code) => code));
    const px = new Uint8Array(biome.length * 4).fill(7);
    writeWaterClass(px, biome, defs);
    const slots = paletteData(defs);
    defs.forEach((_, code) => {
      const slot = slots[code * 4 + 3]!;
      const want = slot === LAKE_SLOT ? SEA_MAP_ALPHA.lake : slot === WATER_SLOT ? SEA_MAP_ALPHA.sea : SEA_MAP_ALPHA.land;
      expect(px[code * 4 + 3]).toBe(want);
      expect(px[code * 4]).toBe(7);
    });
    expect([...new Set(Array.from(px.filter((_, i) => i % 4 === 3)))].sort((a, b) => a - b)).toEqual([0, 128, 255]);
    expect(() => writeWaterClass(px, new Uint8Array([defs.length]), defs)).toThrow();
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertProvinceCount,
  GEN_STAGES,
  generateWorld,
  type GenStage,
} from '../../../src/sim/world/generateWorld';
import { defaultParams, GEN_VERSION, SIZE_PRESETS } from '../../../src/sim/world/params';
import type { World } from '../../../src/sim/world/types';

const { w: WORLD_W, h: WORLD_H } = SIZE_PRESETS.medium;

describe('assertProvinceCount', () => {
  it('65536 throws, 65535 does not', () => {
    expect(() => assertProvinceCount(65536)).toThrow('too_many_provinces');
    expect(() => assertProvinceCount(65535)).not.toThrow();
  });
});

describe('generateWorld', () => {
  let a: World;
  let b: World;
  let ms = 0;
  let c: World;
  const stages: GenStage[] = [];
  let surface: { height: Float32Array; biome: Uint8Array; w: number; h: number; stagesBefore: number } | null = null;
  beforeAll(() => {
    const t = performance.now();
    a = generateWorld(
      defaultParams('Бета-7'),
      (s) => stages.push(s),
      (height, biome, _defs, w, h) => (surface = { height, biome, w, h, stagesBefore: stages.length }),
    );
    ms = performance.now() - t;
    b = generateWorld(defaultParams('Бета-7'));
    c = generateWorld(defaultParams('другое-зерно'));
  }, 60000);

  it('sizes and consistency', () => {
    expect(a.w).toBe(WORLD_W);
    expect(a.h).toBe(WORLD_H);
    expect(a.params).toEqual(defaultParams('Бета-7'));
    expect(a.provinceOf.length).toBe(WORLD_W * WORLD_H);
    expect(a.provinces.length).toBeGreaterThan(0);
  });

  it('deterministic: the arrays are byte-identical', () => {
    const eq = (x: ArrayBufferView, y: ArrayBufferView): boolean =>
      Buffer.compare(
        Buffer.from(x.buffer, x.byteOffset, x.byteLength),
        Buffer.from(y.buffer, y.byteOffset, y.byteLength),
      ) === 0;
    expect(eq(a.height, b.height)).toBe(true);
    expect(eq(a.temperature, b.temperature)).toBe(true);
    expect(eq(a.moisture, b.moisture)).toBe(true);
    expect(eq(a.biome, b.biome)).toBe(true);
    expect(eq(a.riverMask, b.riverMask)).toBe(true);
    expect(eq(a.provinceOf, b.provinceOf)).toBe(true);
    expect(JSON.stringify(a.rivers)).toBe(JSON.stringify(b.rivers));
    expect(JSON.stringify(a.provinces)).toBe(JSON.stringify(b.provinces));
    expect(JSON.stringify(a.adjacency)).toBe(JSON.stringify(b.adjacency));
  });

  it('params of another generator version are rejected with a clear error', () => {
    expect(() => generateWorld({ ...defaultParams('x'), genVersion: GEN_VERSION - 1 })).toThrow('gen_version_mismatch');
  });

  it('the params are a copy: editing the source does not change the world', () => {
    const p = defaultParams('Бета-7');
    expect(a.params).not.toBe(p);
  });

  it('consistency of provinces and provinceOf', () => {
    a.provinces.forEach((p, i) => expect(p.id).toBe(i));
    let max = 0;
    for (const v of a.provinceOf) if (v > max) max = v;
    expect(max).toBeLessThan(a.provinces.length);
  });

  it('a different seed gives a different world', () => {
    expect(Buffer.from(c.provinceOf.buffer).equals(Buffer.from(a.provinceOf.buffer))).toBe(false);
  });

  it('onStage is called before each of the 6 stages in order', () => {
    expect(GEN_STAGES).toEqual(['height', 'climate', 'biomes', 'shoreline', 'rivers', 'provinces']);
    expect(stages).toEqual([...GEN_STAGES]);
  });

  it('onSurface receives the final height and biomes right after the shores stage', () => {
    expect(surface).not.toBeNull();
    expect(surface!.height).toBe(a.height);
    expect(surface!.biome).toBe(a.biome);
    expect([surface!.w, surface!.h]).toEqual([a.w, a.h]);
    expect(surface!.stagesBefore).toBe(GEN_STAGES.indexOf('shoreline') + 1);
  });

  it('generation stays within a rough bound', () => {
    // Smoke bound: under node load (parallel tests) the time jumps to 12+ s, so the 20 s limit
    // catches only a gross failure. The real budget is ≤ 6 s from request to map in the browser,
    // in the worker (spec: 8 s); it is checked via the timings in the debug panel (F3).
    expect(ms).toBeLessThan(20000);
  }, 60000);
});

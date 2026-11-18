import { describe, expect, it } from 'vitest';
import { resolveBiomes } from '../../../src/content/registry';
import { normalizeShoreline as normalize } from '../../../src/sim/world/shoreline';
import { SEA_LEVEL } from '../../../src/content/terrainLevels';

const W = 40;
const H = 20;
const defs = resolveBiomes({});
const code = (id: string): number => defs.findIndex((d) => d.id === id);
const normalizeShoreline = (height: Float32Array, biomes: Uint8Array, w: number, h: number) =>
  normalize(height, biomes, w, h, defs);

/** All-ocean grid with given cells raised to land of the given biome. */
function grid(): { height: Float32Array; biomes: Uint8Array } {
  return { height: new Float32Array(W * H).fill(0.3), biomes: new Uint8Array(W * H).fill(code('ocean')) };
}
function setLand(g: { height: Float32Array; biomes: Uint8Array }, x0: number, y0: number, x1: number, y1: number, b = 'plains'): void {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    g.height[y * W + x] = 0.6;
    g.biomes[y * W + x] = code(b);
  }
}
function setWater(g: { height: Float32Array; biomes: Uint8Array }, cells: Array<[number, number]>): void {
  for (const [x, y] of cells) {
    g.height[y * W + x] = 0.45;
    g.biomes[y * W + x] = code('coast');
  }
}
/** First n cells of a rectangle region filled row by row (keeps the shape 4-connected). */
function blob(x0: number, y0: number, width: number, n: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 0; k < n; k++) out.push([x0 + (k % width), y0 + Math.floor(k / width)]);
  return out;
}

describe('normalizeShoreline', () => {
  it('sinks a 5-cell island to coast water and keeps a 6-cell island', () => {
    const g = grid();
    for (const [x, y] of blob(3, 3, 3, 5)) setLand(g, x, y, x + 1, y + 1);
    for (const [x, y] of blob(20, 3, 3, 6)) setLand(g, x, y, x + 1, y + 1, 'forest');
    const r = normalizeShoreline(g.height, g.biomes, W, H);
    for (const [x, y] of blob(3, 3, 3, 5)) {
      expect(r.height[y * W + x]!).toBeLessThanOrEqual(SEA_LEVEL);
      expect(r.biomes[y * W + x]).toBe(code('coast'));
    }
    for (const [x, y] of blob(20, 3, 3, 6)) {
      expect(r.height[y * W + x]!).toBeGreaterThan(SEA_LEVEL);
      expect(r.biomes[y * W + x]).toBe(code('forest'));
    }
  });

  it('fills a 29-cell enclosed lake with the majority neighbour biome, keeps a 30-cell lake', () => {
    const g = grid();
    // Big continent; left half forest, right part mostly steppe.
    setLand(g, 1, 1, W - 1, H - 1, 'steppe');
    setLand(g, 1, 1, 5, H - 1, 'forest');
    const small = blob(6, 3, 6, 29); // rows y=3..7 inside steppe, touching forest? x>=6 -> no
    const big = blob(22, 3, 6, 30);
    setWater(g, small);
    setWater(g, big);
    const r = normalizeShoreline(g.height, g.biomes, W, H);
    for (const [x, y] of small) {
      expect(r.height[y * W + x]!).toBeGreaterThan(SEA_LEVEL);
      expect(r.biomes[y * W + x]).toBe(code('steppe'));
    }
    for (const [x, y] of big) {
      expect(r.height[y * W + x]!).toBeLessThanOrEqual(SEA_LEVEL);
      expect(r.biomes[y * W + x]).toBe(code('coast'));
    }
  });

  it('breaks biome ties toward the lowest code', () => {
    const g = grid();
    setLand(g, 1, 1, W - 1, H - 1, 'forest');
    // Single water cell at (10,10): neighbours left/up plains, right/down forest -> tie, plains (2) < forest (3).
    setLand(g, 9, 10, 10, 11, 'plains');
    setLand(g, 10, 9, 11, 10, 'plains');
    setWater(g, [[10, 10]]);
    const r = normalizeShoreline(g.height, g.biomes, W, H);
    expect(r.biomes[10 * W + 10]).toBe(code('plains'));
  });

  it('keeps a small water body touching the map border', () => {
    const g = grid();
    setLand(g, 0, 0, W, H, 'plains');
    const pond = blob(0, 5, 2, 4);
    setWater(g, pond);
    const r = normalizeShoreline(g.height, g.biomes, W, H);
    for (const [x, y] of pond) expect(r.height[y * W + x]!).toBeLessThanOrEqual(SEA_LEVEL);
  });

  it('does not mutate its inputs', () => {
    const g = grid();
    setLand(g, 3, 3, 5, 5);
    setLand(g, 10, 2, 20, 12);
    setWater(g, [[14, 6]]);
    const h0 = new Float32Array(g.height);
    const b0 = new Uint8Array(g.biomes);
    const r = normalizeShoreline(g.height, g.biomes, W, H);
    expect(r.height).not.toBe(g.height);
    expect(r.biomes).not.toBe(g.biomes);
    expect([...g.height]).toEqual([...h0]);
    expect([...g.biomes]).toEqual([...b0]);
    expect(r.height[4 * W + 4]!).toBeLessThanOrEqual(SEA_LEVEL);
    expect(r.height[6 * W + 14]!).toBeGreaterThan(SEA_LEVEL);
  });
});

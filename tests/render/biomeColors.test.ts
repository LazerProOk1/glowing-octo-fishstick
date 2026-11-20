import { describe, expect, it } from 'vitest';
import { resolveBiomes } from '../../src/content/registry';
import { bakeBiomeColors } from '../../src/render/biomeColors';

const W = 40;
const H = 24;
const defs = resolveBiomes({});
const code = (id: string): number => defs.findIndex((d) => d.id === id);
const PALETTE = { plains: defs[code('plains')]!.color, desert: defs[code('desert')]!.color };

/** Left third ocean, middle plains, right desert. */
function map(): Uint8Array {
  const a = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) a[y * W + x] = x < 12 ? code('ocean') : x < 26 ? code('plains') : code('desert');
  }
  return a;
}

const px = (out: Uint8Array, x: number, y: number): number[] => Array.from(out.slice((y * W + x) * 4, (y * W + x) * 4 + 4));

describe('bakeBiomeColors', () => {
  const out = bakeBiomeColors(map(), defs, W, H);

  it('RGBA, 4 bytes per cell', () => {
    expect(out).toHaveLength(W * H * 4);
  });

  it('inside a uniform area the colour is exactly the palette one, land coverage is full', () => {
    expect(px(out, 19, 12)).toEqual([...PALETTE.plains, 255]);
    expect(px(out, 35, 12)).toEqual([...PALETTE.desert, 255]);
  });

  it('water does not bleed: at the shore the land colour stays the biome colour', () => {
    const [r, g, b, a] = px(out, 12, 12);
    expect([r, g, b]).toEqual([...PALETTE.plains]);
    expect(a).toBeGreaterThan(100);
    expect(a).toBeLessThan(255);
  });

  it('far out in the water the coverage is zero', () => {
    expect(px(out, 2, 12)[3]).toBe(0);
  });

  it('at a biome boundary the colour is a blend that changes monotonically along x', () => {
    const reds = [22, 23, 24, 25, 26, 27, 28, 29].map((x) => px(out, x, 12)[0] as number);
    for (let i = 1; i < reds.length; i++) expect(reds[i]).toBeGreaterThanOrEqual(reds[i - 1] as number);
    expect(reds[0]).toBe(PALETTE.plains[0]);
    expect(reds[reds.length - 1]).toBe(PALETTE.desert[0]);
    const mid = px(out, 26, 12)[0] as number;
    expect(mid).toBeGreaterThan(PALETTE.plains[0]);
    expect(mid).toBeLessThan(PALETTE.desert[0]);
  });
});

describe('bakeBiomeColors unknown code', () => {
  it('throws like the other bakes', () => {
    expect(() => bakeBiomeColors(new Uint8Array([200]), defs, 1, 1)).toThrow();
  });
});

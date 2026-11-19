import { describe, expect, it } from 'vitest';
import { labelByKey, labelComponents } from '../../../src/sim/geom/label';

// Two islands: 3 cells on the left and 4 cells (a 2×2 square) on the right.
const MASK = [
  '1100000',
  '1000011',
  '0000011',
];
const w = MASK[0]!.length;
const h = MASK.length;
const mask = Uint8Array.from(MASK.join(''), (c) => (c === '1' ? 1 : 0));

describe('labelComponents', () => {
  it('mask with two islands: 2 land components with the right sizes', () => {
    const { comp, sizes } = labelComponents(mask, w, h);
    const land = new Set<number>();
    for (let i = 0; i < mask.length; i++) if (mask[i]) land.add(comp[i]!);
    expect(land.size).toBe(2);
    expect([...land].map((k) => sizes[k]).sort()).toEqual([3, 4]);
    // The water is a single connected region.
    expect(sizes.length).toBe(3);
  });

  it('matches labelByKey', () => {
    const a = labelComponents(mask, w, h);
    const b = labelByKey(Int32Array.from(mask), w, h);
    expect(Array.from(a.comp)).toEqual(Array.from(b.comp));
    expect(a.sizes).toEqual(b.sizes);
  });
});

describe('labelByKey', () => {
  it('4-connectivity: a diagonal does not connect', () => {
    const { sizes } = labelByKey(Int32Array.from([1, 0, 0, 1]), 2, 2);
    expect(sizes).toEqual([1, 1, 1, 1]);
  });
});

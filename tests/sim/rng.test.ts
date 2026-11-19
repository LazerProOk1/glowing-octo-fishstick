import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/sim/rng';

describe('rng', () => {
  it('same seed same sequence', () => {
    const a = createRng('Бета-7');
    const b = createRng('Бета-7');
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it('different seeds differ', () => {
    const a = createRng('a');
    const b = createRng('b');
    const sa = Array.from({ length: 10 }, () => a.next());
    const sb = Array.from({ length: 10 }, () => b.next());
    expect(sa).not.toEqual(sb);
  });

  it('empty seed works', () => {
    const r = createRng('');
    for (let i = 0; i < 100; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('fork is independent and deterministic', () => {
    const f1 = createRng('s').fork('rivers');
    const f2 = createRng('s').fork('rivers');
    for (let i = 0; i < 50; i++) expect(f1.next()).toBe(f2.next());

    const parent = createRng('s');
    const ref = createRng('s');
    parent.fork('rivers');
    for (let i = 0; i < 50; i++) expect(parent.next()).toBe(ref.next());

    const other = createRng('s').fork('lakes');
    const again = createRng('s').fork('rivers');
    expect(other.next()).not.toBe(again.next());
  });

  it('int range', () => {
    const r = createRng('int');
    const seen = new Set<number>();
    for (let i = 0; i < 10000; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('int: non-integer arguments and an empty range are an error', () => {
    const r = createRng('int-bad');
    expect(() => r.int(1.5, 4)).toThrow(RangeError);
    expect(() => r.int(1, 4.5)).toThrow(RangeError);
    expect(() => r.int(3, 3)).toThrow(RangeError);
    expect(() => r.int(5, 2)).toThrow(RangeError);
    expect(() => r.int(0, Number.NaN)).toThrow(RangeError);
  });
});

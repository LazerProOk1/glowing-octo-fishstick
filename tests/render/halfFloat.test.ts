import { describe, expect, it } from 'vitest';
import { toHalf } from '../../src/render/halfFloat';

describe('toHalf', () => {
  it('encodes exact values', () => {
    expect(toHalf(0)).toBe(0);
    expect(toHalf(1)).toBe(0x3c00);
    expect(toHalf(0.5)).toBe(0x3800);
    expect(toHalf(-2)).toBe(0xc000);
    expect(toHalf(65504)).toBe(0x7bff);
    expect(toHalf(2 ** -24)).toBe(1);
    expect(toHalf(2 ** -14)).toBe(0x0400);
  });

  it('rounds to nearest and saturates to infinity', () => {
    expect(toHalf(1 + 2 ** -11 + 2 ** -13)).toBe(0x3c01);
    expect(toHalf(1e6)).toBe(0x7c00);
  });

  it('small relative heights keep their precision', () => {
    const decode = (h: number): number => {
      const e = (h >> 10) & 31;
      const m = h & 1023;
      const s = h & 0x8000 ? -1 : 1;
      return e === 0 ? s * m * 2 ** -24 : s * (1 + m / 1024) * 2 ** (e - 15);
    };
    for (const v of [0.005, -0.005, 0.22, -0.31, 0.5]) {
      expect(Math.abs(decode(toHalf(v)) - v)).toBeLessThan(Math.abs(v) * 1e-3 + 1e-7);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { hsl, saturation } from '../../src/content/color';

describe('цвет', () => {
  it('saturation: серый 0, чистый красный 1', () => {
    expect(saturation(128, 128, 128)).toBe(0);
    expect(saturation(255, 0, 0)).toBe(1);
  });

  it('hsl: тон, насыщенность, светлота', () => {
    expect(hsl([255, 0, 0])).toEqual({ h: 0, s: 1, l: 0.5 });
    expect(hsl([0, 255, 0]).h).toBeCloseTo(120, 9);
    expect(hsl([0, 0, 255]).h).toBeCloseTo(240, 9);
    expect(hsl([255, 0, 255]).h).toBeCloseTo(300, 9);
    expect(hsl([128, 128, 128])).toEqual({ h: 0, s: 0, l: 128 / 255 });
  });

  it('saturation совпадает с hsl().s', () => {
    for (const c of [[140, 128, 120], [20, 200, 90], [255, 255, 255], [0, 0, 0]] as const) {
      expect(saturation(c[0], c[1], c[2])).toBe(hsl(c).s);
    }
  });
});

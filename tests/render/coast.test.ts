import { describe, expect, it } from 'vitest';
import { coastSignedDistance } from '../../src/render/bakeWorld';
import { generateWorld } from '../../src/sim/world/generateWorld';
import { defaultParams } from '../../src/sim/world/params';
import type { Province } from '../../src/sim/world/types';

describe('coastSignedDistance', () => {
  it('coastAgreesWithCells: знак совпадает с сушей провинции клетки (сид "1", small)', () => {
    const p = defaultParams('1');
    p.options.size = 'small';
    const world = generateWorld(p);
    const { w, h, provinces, provinceOf } = world;
    const sd = coastSignedDistance(provinces, provinceOf, w, h);
    expect(sd.length).toBe(w * h);
    let bad = 0;
    for (let i = 0; i < w * h; i++) {
      const land = provinces[provinceOf[i]!]!.isLand;
      if (Math.sign(sd[i]!) !== (land ? 1 : -1)) bad++;
    }
    expect(bad).toBe(0);
  }, 60000);

  it('на прямом береге в центре клетки у берега ±0.5', () => {
    const w = 32;
    const h = 8;
    const provinces = [{ isLand: false }, { isLand: true }] as Province[];
    const provinceOf = new Uint16Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w / 2; x++) provinceOf[y * w + x] = 1;
    const sd = coastSignedDistance(provinces, provinceOf, w, h);
    for (let y = 0; y < h; y++) {
      expect(sd[y * w + 15]).toBeCloseTo(0.5, 6);
      expect(sd[y * w + 16]).toBeCloseTo(-0.5, 6);
      expect(sd[y * w + 0]).toBeCloseTo(15.5, 6);
      expect(sd[y * w + 31]).toBeCloseTo(-15.5, 6);
    }
  });
});

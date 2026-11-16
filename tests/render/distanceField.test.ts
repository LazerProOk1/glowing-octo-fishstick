import { describe, expect, it } from 'vitest';
import { borderDistance } from '../../src/render/distanceField';

describe('borderDistance', () => {
  it('8x8 из двух половин: столбцы 3 и 4 дают 0.5, столбец 0 дает 3.5', () => {
    const w = 8;
    const h = 8;
    const p = new Uint16Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p[y * w + x] = x < 4 ? 0 : 1;
    const d = borderDistance(p, w, h);
    for (let y = 0; y < h; y++) {
      expect(d[y * w + 3]).toBeCloseTo(0.5, 5);
      expect(d[y * w + 4]).toBeCloseTo(0.5, 5);
      expect(d[y * w + 0]).toBeCloseTo(3.5, 5);
      expect(d[y * w + 7]).toBeCloseTo(3.5, 5);
    }
  });

  it('одна провинция: расстояние большое и конечное по размеру', () => {
    const d = borderDistance(new Uint16Array(16), 4, 4);
    expect(d[0]).toBeGreaterThanOrEqual(4);
  });

  it('2048x1024 укладывается в разумное время', () => {
    const w = 2048;
    const h = 1024;
    const p = new Uint16Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p[y * w + x] = (x >> 6) + (y >> 6) * 32;
    const t = performance.now();
    borderDistance(p, w, h);
    expect(performance.now() - t).toBeLessThan(2000);
  });
});

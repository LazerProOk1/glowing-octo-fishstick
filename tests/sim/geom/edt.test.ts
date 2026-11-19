import { describe, expect, it } from 'vitest';
import { borderDistance } from '../../../src/sim/geom/edt';

describe('borderDistance', () => {
  it('8x8 split in two halves: columns 3 and 4 give 0.5, column 0 gives 3.5', () => {
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

  it('horizontal split: rows 3 and 4 give 0.5, row 0 gives 3.5', () => {
    const w = 8;
    const h = 8;
    const p = new Uint16Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p[y * w + x] = y < 4 ? 0 : 1;
    const d = borderDistance(p, w, h);
    expect(d[3 * w + 2]).toBeCloseTo(0.5, 5);
    expect(d[4 * w + 2]).toBeCloseTo(0.5, 5);
    expect(d[2]).toBeCloseTo(3.5, 5);
  });

  it('2x2 checkerboard: every cell has a border at 0.5', () => {
    const d = borderDistance(new Uint16Array([0, 1, 1, 0]), 2, 2);
    for (let i = 0; i < 4; i++) expect(d[i], `клетка ${i}`).toBeCloseTo(0.5, 5);
  });

  it('one province: the distance is large and bounded by the size', () => {
    const d = borderDistance(new Uint16Array(16), 4, 4);
    expect(Number.isFinite(d[0])).toBe(true);
    expect(d[0]).toBeGreaterThanOrEqual(4);
  });

  it('matches a brute-force scan over all border points on a random partition', () => {
    const w = 23;
    const h = 17;
    let s = 7;
    const rnd = (): number => ((s = (s * 16807) % 2147483647) / 2147483647);
    // Several "provinces" as rectangles of different sizes, with random spots on top.
    const p = new Uint16Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p[y * w + x] = Math.floor(x / 7) + 4 * Math.floor(y / 5);
    for (let k = 0; k < 12; k++) p[Math.floor(rnd() * w * h)] = 50 + k;
    // Border points are the midpoints between 4-neighbours with different provinces, in cell coordinates.
    const pts: [number, number][] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x + 1 < w && p[y * w + x] !== p[y * w + x + 1]) pts.push([x + 0.5, y]);
        if (y + 1 < h && p[y * w + x] !== p[(y + 1) * w + x]) pts.push([x, y + 0.5]);
      }
    }
    const d = borderDistance(p, w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let best = Infinity;
        for (const [px, py] of pts) best = Math.min(best, Math.hypot(px - x, py - y));
        expect(d[y * w + x], `${x},${y}`).toBeCloseTo(best, 5);
      }
    }
  });

  it('2048x1024 finishes in reasonable time', () => {
    const w = 2048;
    const h = 1024;
    const p = new Uint16Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p[y * w + x] = (x >> 6) + (y >> 6) * 32;
    const t = performance.now();
    borderDistance(p, w, h);
    expect(performance.now() - t).toBeLessThan(2000);
  });
});

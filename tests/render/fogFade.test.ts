import { describe, expect, it } from 'vitest';
import { FogFade } from '../../src/render/fogFade';

describe('FogFade', () => {
  it('fades from 0 monotonically and ends exactly at 0/255', () => {
    const f = new FogFade(3, 1000);
    const lv = [0, 0, 0];
    f.setTarget(Uint8Array.from([1, 0, 1]));
    let prev = 0;
    while (f.busy) {
      f.step(100, (id, l) => (lv[id] = l));
      expect(lv[0]).toBeGreaterThanOrEqual(prev);
      prev = lv[0]!;
    }
    expect(lv).toEqual([255, 0, 255]);
  });

  it('is idle without changes and fades back from the current level', () => {
    const f = new FogFade(2, 1000);
    const lv = [0, 0];
    expect(f.step(16, () => {})).toBe(false);
    f.setTarget(Uint8Array.from([1, 1]));
    f.step(500, (id, l) => (lv[id] = l));
    const mid = lv[0]!;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(255);
    f.setTarget(Uint8Array.from([0, 1]));
    f.step(16, (id, l) => (lv[id] = l));
    expect(lv[0]).toBeLessThanOrEqual(mid);
    f.step(5000, (id, l) => (lv[id] = l));
    expect(lv).toEqual([0, 255]);
    expect(f.step(16, () => {})).toBe(false);
  });
});

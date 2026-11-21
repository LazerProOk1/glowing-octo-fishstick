import { describe, expect, it } from 'vitest';
import { FogFade } from '../../src/render/fogFade';
import { CameraFlight, lerpCamera } from '../../src/render/cameraFlight';

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

describe('camera flight', () => {
  const a = { x: 0, y: 0, zoom: 1 };
  const b = { x: 100, y: 50, zoom: 8 };
  it('stays between the endpoints and ends exactly at the target', () => {
    for (let t = 0; t <= 1; t += 0.05) {
      const c = lerpCamera(a, b, t);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThanOrEqual(100);
      expect(c.zoom).toBeGreaterThanOrEqual(1);
      expect(c.zoom).toBeLessThanOrEqual(8);
    }
    const fl = new CameraFlight();
    fl.start(a, b, 1000);
    expect(fl.step(600)).not.toEqual(b);
    expect(fl.step(600)).toEqual(b);
    expect(fl.step(16)).toBeNull();
  });
  it('cancel stops the flight', () => {
    const fl = new CameraFlight();
    fl.start(a, b, 1000);
    fl.cancel();
    expect(fl.step(16)).toBeNull();
  });
});

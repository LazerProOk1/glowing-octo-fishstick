import { describe, expect, it } from 'vitest';
import { CameraFlight, lerpCamera } from '../../src/render/cameraFlight';

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

import { describe, expect, it } from 'vitest';
import { frameStats } from '../../src/render/frameBench';

describe('frameStats', () => {
  it('computes the mean, the 95th percentile and fps', () => {
    const s = frameStats([10, 10, 10, 20]);
    expect(s.avg).toBe(12.5);
    expect(s.p95).toBe(20);
    expect(s.fps).toBe(80);
  });

  it('does not depend on the order of the measurements', () => {
    expect(frameStats([20, 10, 10, 10]).p95).toBe(20);
  });

  it('an empty set gives zeros', () => {
    expect(frameStats([])).toEqual({ avg: 0, p95: 0, fps: 0 });
  });
});

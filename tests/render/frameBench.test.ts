import { describe, expect, it } from 'vitest';
import { frameStats } from '../../src/render/frameBench';

describe('frameStats', () => {
  it('считает среднее, 95-й процентиль и к/с', () => {
    const s = frameStats([10, 10, 10, 20]);
    expect(s.avg).toBe(12.5);
    expect(s.p95).toBe(20);
    expect(s.fps).toBe(80);
  });

  it('не зависит от порядка замеров', () => {
    expect(frameStats([20, 10, 10, 10]).p95).toBe(20);
  });

  it('пустой набор даёт нули', () => {
    expect(frameStats([])).toEqual({ avg: 0, p95: 0, fps: 0 });
  });
});

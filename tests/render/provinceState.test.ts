import { describe, expect, it } from 'vitest';
import { ProvinceState } from '../../src/render/provinceState';

describe('ProvinceState', () => {
  it('uses the province data layout', () => {
    const s = new ProvinceState(10, 4);
    expect([s.width, s.height]).toEqual([4, 3]);
    expect(s.data.length).toBe(4 * 3 * 4);
  });

  it('setFog writes R, setOwn writes G, one dirty range', () => {
    const s = new ProvinceState(10, 4);
    expect(s.takeDirty()).toBeNull();
    s.setFog(7, 200);
    s.setOwn(2, true);
    expect([...s.data.subarray(28, 32)]).toEqual([200, 0, 0, 0]);
    expect([...s.data.subarray(8, 12)]).toEqual([0, 255, 0, 0]);
    expect(s.takeDirty()).toEqual({ start: 2, end: 8 });
    expect(s.takeDirty()).toBeNull();
    s.setOwn(2, false);
    expect(s.data[9]).toBe(0);
    expect(s.takeDirty()).toEqual({ start: 2, end: 3 });
  });

  it('writing the same value does not mark it dirty', () => {
    const s = new ProvinceState(3, 4);
    s.setFog(1, 0);
    s.setOwn(1, false);
    expect(s.takeDirty()).toBeNull();
  });

  it('bad id is an error, bad fog level a RangeError', () => {
    const s = new ProvinceState(3, 4);
    expect(() => s.setFog(3, 0)).toThrow();
    expect(() => s.setOwn(-1, true)).toThrow();
    expect(() => s.setFog(0, 256)).toThrow(RangeError);
    expect(() => s.setFog(0, 1.5)).toThrow(RangeError);
    expect(() => s.setFog(0, Number.NaN)).toThrow(RangeError);
  });
});

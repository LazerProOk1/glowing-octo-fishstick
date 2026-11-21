import { describe, expect, it } from 'vitest';
import { isVisible, startVisibility } from '../../src/game/visibility';
import { generateWorld } from '../../src/sim/world/generateWorld';
import { defaultParams } from '../../src/sim/world/params';

describe('startVisibility', { timeout: 60_000 }, () => {
  it('marks exactly the start province and its neighbours', () => {
    const p = defaultParams('1');
    const w = generateWorld({ ...p, options: { ...p.options, size: 'small' } });
    const start = w.provinces.findIndex((x) => x.isLand);
    const vis = startVisibility(w, start);
    const want = new Set([start, ...w.provinces[start]!.neighbors]);
    expect(vis.length).toBe(w.provinces.length);
    for (let i = 0; i < vis.length; i++) expect(isVisible(vis, i)).toBe(want.has(i));
  });
});

describe('isVisible', () => {
  it('treats any non-zero value as visible', () => {
    const vis = Uint8Array.from([0, 1, 255]);
    expect([0, 1, 2, 3].map((i) => isVisible(vis, i))).toEqual([false, true, true, false]);
  });
});

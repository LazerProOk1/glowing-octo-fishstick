import { describe, expect, it } from 'vitest';
import { isVisible, startVisibility } from '../../src/game/visibility';
import { generateWorld } from '../../src/sim/world/generateWorld';
import { defaultParams } from '../../src/sim/world/params';

describe('startVisibility', { timeout: 60_000 }, () => {
  it('marks exactly the start group and its neighbours', () => {
    const p = defaultParams('1');
    const w = generateWorld({ ...p, options: { ...p.options, size: 'small' } });
    const first = w.provinces.findIndex((x) => x.isLand);
    const group = [first, w.provinces[first]!.neighbors.find((n) => w.provinces[n]!.isLand) ?? first];
    const vis = startVisibility(w, group);
    const want = new Set(group.flatMap((id) => [id, ...w.provinces[id]!.neighbors]));
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

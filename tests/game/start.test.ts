import { describe, expect, it } from 'vitest';
import { pickStartProvince } from '../../src/game/start';
import { generateWorld } from '../../src/sim/world/generateWorld';
import { defaultParams } from '../../src/sim/world/params';
import type { World } from '../../src/sim/world/types';

const cache = new Map<string, World>();
const small = (seed: string, disabledBiomes: string[] = []): World => {
  const key = seed + disabledBiomes.join();
  const hit = cache.get(key);
  if (hit) return hit;
  const p = defaultParams(seed);
  const w = generateWorld({ ...p, options: { ...p.options, size: 'small', disabledBiomes } });
  cache.set(key, w);
  return w;
};
const landNeighbours = (w: World, id: number): number =>
  w.provinces[id]!.neighbors.filter((n) => w.provinces[n]!.isLand).length;

describe('pickStartProvince', { timeout: 60_000 }, () => {
  it('is deterministic', () => {
    const a = small('1');
    expect(pickStartProvince(a)).toBe(pickStartProvince({ ...a }));
  });

  it.each(['1', 'worldbox', 'Бета-7', '42', 'abc'])('seed %s: startable biome, ≥ 3 land neighbours', (seed) => {
    const w = small(seed);
    const p = w.provinces[pickStartProvince(w)]!;
    expect(p.isLand).toBe(true);
    expect(w.biomes.find((b) => b.id === p.biome)?.startable).toBe(true);
    expect(landNeighbours(w, p.id)).toBeGreaterThanOrEqual(3);
  });

  it('still starts on land when no startable biome is enabled', () => {
    // plains cannot be disabled, so strip the flag from the biome defs instead.
    const base = small('1');
    const w = { ...base, biomes: base.biomes.map((b) => ({ ...b, startable: false })) };
    expect(w.provinces[pickStartProvince(w)]!.isLand).toBe(true);
  });

  it('throws only when there is no land', () => {
    const w = small('1');
    const sea = { ...w, provinces: w.provinces.map((p) => ({ ...p, isLand: false })) };
    expect(() => pickStartProvince(sea)).toThrow(/no_start_province/);
  });
});

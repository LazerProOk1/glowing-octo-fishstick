import { beforeAll, describe, expect, it } from 'vitest';
import { translate } from '../../src/i18n/ru';
import { saturation } from '../../src/content/color';
import { MAP_MODES, mapModeById, nextMapMode } from '../../src/render/mapModes';
import { generateWorld } from '../../src/sim/world/generateWorld';
import { defaultParams } from '../../src/sim/world/params';
import type { World } from '../../src/sim/world/types';

function smallWorld(): World {
  const p = defaultParams('режимы');
  return generateWorld({ ...p, options: { ...p.options, size: 'small' } });
}

describe('map modes', () => {
  let world: World;
  beforeAll(() => {
    world = smallWorld();
  }, 60000);

  it('ids have no duplicates, every mode has a name translation', () => {
    const ids = MAP_MODES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('terrain');
    expect(ids).toContain('provinces');
    for (const m of MAP_MODES) expect(translate(m.nameKey), m.id).not.toBe(m.nameKey);
  });

  it('terrain fills nothing', () => {
    const terrain = mapModeById('terrain')!;
    for (const p of world.provinces) expect(terrain.color(p, world)).toBeNull();
  });

  it('provinces: every land cell is filled, land neighbours have different colours', () => {
    const mode = mapModeById('provinces')!;
    const colors = world.provinces.map((p) => mode.color(p, world));
    const key = (c: readonly number[] | null): string => (c ? c.slice(0, 3).join(',') : 'none');
    let checked = 0;
    for (const e of world.adjacency) {
      const a = world.provinces[e.a]!;
      const b = world.provinces[e.b]!;
      if (!a.isLand || !b.isLand) continue;
      expect(key(colors[e.a]!), `${e.a}-${e.b}`).not.toBe(key(colors[e.b]!));
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
    for (const p of world.provinces) if (p.isLand) expect(colors[p.id]).not.toBeNull();
  });

  it('provinces: muted colours (saturation ≤ 0.45), channels 0..255', () => {
    const mode = mapModeById('provinces')!;
    for (const p of world.provinces) {
      const c = mode.color(p, world);
      if (!c) continue;
      for (const v of c) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      }
      expect(saturation(c[0], c[1], c[2])).toBeLessThanOrEqual(0.45);
    }
  });

  it('provinces: the colouring is deterministic', () => {
    const mode = mapModeById('provinces')!;
    const again = smallWorld();
    for (const p of world.provinces) expect(mode.color(again.provinces[p.id]!, again)).toEqual(mode.color(p, world));
  }, 60000);

  it('nextMapMode cycles through the modes', () => {
    let id = MAP_MODES[0]!.id;
    const seen: string[] = [];
    for (let i = 0; i < MAP_MODES.length; i++) {
      seen.push(id);
      id = nextMapMode(id).id;
    }
    expect(id).toBe(MAP_MODES[0]!.id);
    expect(seen).toEqual(MAP_MODES.map((m) => m.id));
    expect(nextMapMode('нет такого').id).toBe(MAP_MODES[0]!.id);
  });

  it('saturation: grey 0, pure red 1', () => {
    expect(saturation(128, 128, 128)).toBe(0);
    expect(saturation(255, 0, 0)).toBe(1);
  });
});

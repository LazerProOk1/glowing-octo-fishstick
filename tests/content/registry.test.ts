import { describe, expect, it } from 'vitest';
import { DETAIL_SLOT_NAMES, type BiomeDef, type PackManifest } from '../../src/content/biomes/types';
import { BASE_PACK } from '../../src/content/packs/base/manifest';
import { hsl, saturation } from '../../src/content/color';
import { isFallback, resolveBiomes } from '../../src/content/registry';
import { translate } from '../../src/i18n/ru';

/** Old code order (before task 12): a normal world must preserve it. */
const OLD_ORDER = [
  'ocean', 'coast', 'plains', 'forest', 'taiga', 'tundra', 'glacier',
  'desert', 'steppe', 'swamp', 'hills', 'mountains', 'jungle',
];
/** The lake (GEN_VERSION 3) is appended at the end of the pack: old codes do not shift. */
const DEFAULT_ORDER = [...OLD_ORDER, 'lake'];

const all = BASE_PACK.biomes;
const tagged = (tag: string): BiomeDef[] => all.filter((b) => (b.tags as readonly string[] | undefined)?.includes(tag));

describe('biome registry of the base pack', () => {
  it('ids are unique, latin snake_case', () => {
    const ids = all.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('required fields are filled in', () => {
    for (const b of all) {
      expect(b.nameKey, b.id).toBe(`biome.${b.id}`);
      expect(['water', 'land'], b.id).toContain(b.kind);
      expect(typeof b.fantasy, b.id).toBe('boolean');
      expect(Number.isFinite(b.priority), b.id).toBe(true);
      expect(b.when, b.id).toBeDefined();
    }
  });

  it('colour is bytes 0..255, saturation ≤ 0.45, lightness 0.2..0.9', () => {
    for (const b of all) {
      expect(b.color, b.id).toHaveLength(3);
      for (const v of b.color) expect(Number.isInteger(v) && v >= 0 && v <= 255, b.id).toBe(true);
      expect(saturation(...b.color), b.id).toBeLessThanOrEqual(0.45);
      expect(hsl(b.color).l, b.id).toBeGreaterThanOrEqual(0.2);
      expect(hsl(b.color).l, b.id).toBeLessThanOrEqual(0.9);
    }
  });

  it('the detail slot exists in the atlas', () => {
    for (const b of all) expect(DETAIL_SLOT_NAMES, b.id).toContain(b.detail);
  });

  it('condition ranges: min < max', () => {
    for (const b of all) {
      for (const r of Object.values(b.when)) expect(r[0], b.id).toBeLessThan(r[1]);
    }
  });

  it('exactly one land fallback biome without conditions', () => {
    const fallbacks = all.filter((b) => b.kind === 'land' && isFallback(b));
    expect(fallbacks.map((b) => b.id)).toEqual(['plains']);
  });

  it('there are water biomes tagged deepWater/shallowWater and biomes tagged mountain/hill', () => {
    expect(tagged('deepWater').map((b) => b.kind)).toEqual(['water']);
    expect(tagged('shallowWater').map((b) => b.kind)).toEqual(['water']);
    expect(tagged('mountain').length).toBeGreaterThanOrEqual(1);
    expect(tagged('hill').length).toBeGreaterThanOrEqual(1);
  });

  it('four fantasy biomes, crystal mountains are tagged mountain', () => {
    expect(all.filter((b) => b.fantasy).map((b) => b.id).sort()).toEqual(
      ['ash_wastes', 'crystal_mountains', 'magic_forest', 'mushroom_forest'],
    );
    expect(tagged('mountain').map((b) => b.id)).toContain('crystal_mountains');
  });

  it('the biome name is an i18n key with a translation in ru', () => {
    expect(translate(all.find((b) => b.id === 'taiga')!.nameKey)).toBe('тайга');
    expect(translate(all.find((b) => b.id === 'mushroom_forest')!.nameKey)).toBe('грибной лес');
  });

  it('ready-made text instead of a key is an error', () => {
    const bad: PackManifest = {
      id: 'txt', nameKey: 'pack.txt', version: '0',
      biomes: [{ ...all.find((b) => b.id === 'forest')!, id: 'birch', nameKey: 'берёзы' }],
    };
    expect(() => resolveBiomes({ packs: ['base', 'txt'] }, [BASE_PACK, bad])).toThrow(/birch/);
  });
});

describe('resolveBiomes', () => {
  it('by default: base biomes in the old code order, no fantasy', () => {
    expect(resolveBiomes({}).map((b) => b.id)).toEqual(DEFAULT_ORDER);
    expect(resolveBiomes({ packs: ['base'], fantasy: false }).map((b) => b.id)).toEqual(DEFAULT_ORDER);
  });

  it('with fantasy: fantasy biomes are appended after the base ones', () => {
    const ids = resolveBiomes({ fantasy: true }).map((b) => b.id);
    expect(ids.slice(0, OLD_ORDER.length)).toEqual(OLD_ORDER);
    expect(ids.slice(OLD_ORDER.length, -1).sort()).toEqual(['ash_wastes', 'crystal_mountains', 'magic_forest', 'mushroom_forest']);
    expect(ids.at(-1)).toBe('lake');
  });

  it('a disabled biome is removed from the list', () => {
    const ids = resolveBiomes({ disabledBiomes: ['swamp', 'mountains', 'mushroom_forest'], fantasy: true }).map((b) => b.id);
    expect(ids).not.toContain('swamp');
    expect(ids).not.toContain('mountains');
    expect(ids).not.toContain('mushroom_forest');
    expect(ids).toContain('hills');
  });

  it('the fallback and water biomes cannot be disabled: a clear error naming the biome', () => {
    expect(() => resolveBiomes({ disabledBiomes: ['plains'] })).toThrow(/plains/);
    expect(() => resolveBiomes({ disabledBiomes: ['ocean'] })).toThrow(/ocean/);
    expect(() => resolveBiomes({ disabledBiomes: ['coast'] })).toThrow(/coast/);
    expect(() => resolveBiomes({ disabledBiomes: ['lake'] })).toThrow(/lake/);
  });

  it('lake: a water biome tagged lake, not a fallback; it cannot be land', () => {
    const lake = all.find((b) => b.id === 'lake')!;
    expect(lake.kind).toBe('water');
    expect(lake.tags).toContain('lake');
    expect(isFallback(lake)).toBe(false);
    const bad: PackManifest = { id: 'bad', nameKey: 'pack.x', version: '0', biomes: [], overrides: { lake: { kind: 'land' } } };
    expect(() => resolveBiomes({ packs: ['base', 'bad'] }, [BASE_PACK, bad])).toThrow(/lake/);
  });

  it('an unknown biome or pack is an error', () => {
    expect(() => resolveBiomes({ disabledBiomes: ['no_such_biome'] })).toThrow(/no_such_biome/);
    expect(() => resolveBiomes({ packs: ['no_such_pack'] })).toThrow(/no_such_pack/);
  });

  it('a pack with overrides changes the forest colour and adds a biome', () => {
    const extra: BiomeDef = {
      id: 'heath',
      nameKey: 'biome.heath',
      kind: 'land',
      fantasy: false,
      color: [140, 128, 120],
      detail: 'grass',
      priority: 15,
      when: { moisture: [0.4, 0.45] },
    };
    const pack: PackManifest = {
      id: 'test',
      nameKey: 'pack.test',
      version: '0.0.1',
      biomes: [extra],
      overrides: { forest: { color: [100, 110, 90] } },
    };
    const list = resolveBiomes({ packs: ['base', 'test'] }, [BASE_PACK, pack]);
    expect(list.find((b) => b.id === 'forest')!.color).toEqual([100, 110, 90]);
    expect(list.map((b) => b.id)).toEqual([...DEFAULT_ORDER, 'heath']);
    // The base pack is unchanged.
    expect(resolveBiomes({}).find((b) => b.id === 'forest')!.color).not.toEqual([100, 110, 90]);
  });

  it('all declared biomes are validated after the overrides, not only the enabled ones', () => {
    // Fantasy is off, but a broken fantasy biome still raises an error.
    const bright: PackManifest = {
      id: 'bright', nameKey: 'pack.x', version: '0', biomes: [],
      overrides: { magic_forest: { color: [0, 255, 0] } },
    };
    expect(() => resolveBiomes({ packs: ['base', 'bright'] }, [BASE_PACK, bright])).toThrow(/magic_forest/);
    const dark: PackManifest = {
      id: 'dark', nameKey: 'pack.x', version: '0', biomes: [],
      overrides: { forest: { color: [20, 20, 20] } },
    };
    expect(() => resolveBiomes({ packs: ['base', 'dark'] }, [BASE_PACK, dark])).toThrow(/forest/);
  });

  it('an undefined condition in when is skipped, a biome without conditions stays the fallback', () => {
    const pack: PackManifest = {
      id: 'undef', nameKey: 'pack.x', version: '0', biomes: [],
      overrides: { plains: { when: { height: undefined } } },
    };
    const list = resolveBiomes({ packs: ['base', 'undef'] }, [BASE_PACK, pack]);
    expect(isFallback(list.find((b) => b.id === 'plains')!)).toBe(true);
  });

  it('an override of an unknown biome is an error', () => {
    const pack: PackManifest = { id: 'bad', nameKey: 'pack.x', version: '0', biomes: [], overrides: { nope: { priority: 1 } } };
    expect(() => resolveBiomes({ packs: ['base', 'bad'] }, [BASE_PACK, pack])).toThrow(/nope/);
  });
});

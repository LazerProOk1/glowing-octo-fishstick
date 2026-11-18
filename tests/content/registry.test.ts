import { describe, expect, it } from 'vitest';
import { DETAIL_SLOT_NAMES, type BiomeDef, type PackManifest } from '../../src/content/biomes/types';
import { BASE_PACK } from '../../src/content/packs/base/manifest';
import { biomeName, isFallback, resolveBiomes } from '../../src/content/registry';

/** Насыщенность HSL цвета sRGB 0..255. */
function saturation([r, g, b]: readonly [number, number, number]): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
}

/** Старый порядок кодов (до задачи 12): обычный мир обязан его сохранить. */
const OLD_ORDER = [
  'ocean', 'coast', 'plains', 'forest', 'taiga', 'tundra', 'glacier',
  'desert', 'steppe', 'swamp', 'hills', 'mountains', 'jungle',
];

const all = BASE_PACK.biomes;
const tagged = (tag: string): BiomeDef[] => all.filter((b) => (b.tags as readonly string[] | undefined)?.includes(tag));

describe('реестр биомов базового пака', () => {
  it('id уникальны, латиница snake_case', () => {
    const ids = all.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('обязательные поля заполнены', () => {
    for (const b of all) {
      expect(b.name.trim(), b.id).not.toBe('');
      expect(['water', 'land'], b.id).toContain(b.kind);
      expect(typeof b.fantasy, b.id).toBe('boolean');
      expect(Number.isFinite(b.priority), b.id).toBe(true);
      expect(b.when, b.id).toBeDefined();
    }
  });

  it('цвет — байты 0..255, насыщенность ≤ 0.45', () => {
    for (const b of all) {
      expect(b.color, b.id).toHaveLength(3);
      for (const v of b.color) expect(Number.isInteger(v) && v >= 0 && v <= 255, b.id).toBe(true);
      expect(saturation(b.color), b.id).toBeLessThanOrEqual(0.45);
    }
  });

  it('слот детали существует в атласе', () => {
    for (const b of all) expect(DETAIL_SLOT_NAMES, b.id).toContain(b.detail);
  });

  it('диапазоны условий: min < max', () => {
    for (const b of all) {
      for (const r of Object.values(b.when)) expect(r[0], b.id).toBeLessThan(r[1]);
    }
  });

  it('ровно один запасной сухопутный биом без условий', () => {
    const fallbacks = all.filter((b) => b.kind === 'land' && isFallback(b));
    expect(fallbacks.map((b) => b.id)).toEqual(['plains']);
  });

  it('есть водные биомы с тегами deepWater/shallowWater и биомы с тегами mountain/hill', () => {
    expect(tagged('deepWater').map((b) => b.kind)).toEqual(['water']);
    expect(tagged('shallowWater').map((b) => b.kind)).toEqual(['water']);
    expect(tagged('mountain').length).toBeGreaterThanOrEqual(1);
    expect(tagged('hill').length).toBeGreaterThanOrEqual(1);
  });

  it('четыре фэнтези-биома, кристальные горы — с тегом mountain', () => {
    expect(all.filter((b) => b.fantasy).map((b) => b.id).sort()).toEqual(
      ['ash_wastes', 'crystal_mountains', 'magic_forest', 'mushroom_forest'],
    );
    expect(tagged('mountain').map((b) => b.id)).toContain('crystal_mountains');
  });

  it('название биома берётся из реестра', () => {
    expect(biomeName(all.find((b) => b.id === 'taiga')!)).toBe('тайга');
    expect(biomeName(all.find((b) => b.id === 'mushroom_forest')!)).toBe('грибной лес');
  });
});

describe('resolveBiomes', () => {
  it('по умолчанию: базовые биомы в старом порядке кодов, без фэнтези', () => {
    expect(resolveBiomes({}).map((b) => b.id)).toEqual(OLD_ORDER);
    expect(resolveBiomes({ packs: ['base'], fantasy: false }).map((b) => b.id)).toEqual(OLD_ORDER);
  });

  it('с фэнтези: фэнтези-биомы дописаны после базовых', () => {
    const ids = resolveBiomes({ fantasy: true }).map((b) => b.id);
    expect(ids.slice(0, OLD_ORDER.length)).toEqual(OLD_ORDER);
    expect(ids.slice(OLD_ORDER.length).sort()).toEqual(['ash_wastes', 'crystal_mountains', 'magic_forest', 'mushroom_forest']);
  });

  it('выключенный биом убирается из списка', () => {
    const ids = resolveBiomes({ disabledBiomes: ['swamp', 'mountains', 'mushroom_forest'], fantasy: true }).map((b) => b.id);
    expect(ids).not.toContain('swamp');
    expect(ids).not.toContain('mountains');
    expect(ids).not.toContain('mushroom_forest');
    expect(ids).toContain('hills');
  });

  it('запасной и водные биомы выключить нельзя: понятная ошибка с именем биома', () => {
    expect(() => resolveBiomes({ disabledBiomes: ['plains'] })).toThrow(/plains/);
    expect(() => resolveBiomes({ disabledBiomes: ['ocean'] })).toThrow(/ocean/);
    expect(() => resolveBiomes({ disabledBiomes: ['coast'] })).toThrow(/coast/);
  });

  it('неизвестный биом или пак — ошибка', () => {
    expect(() => resolveBiomes({ disabledBiomes: ['no_such_biome'] })).toThrow(/no_such_biome/);
    expect(() => resolveBiomes({ packs: ['no_such_pack'] })).toThrow(/no_such_pack/);
  });

  it('пак с overrides меняет цвет леса и добавляет биом', () => {
    const extra: BiomeDef = {
      id: 'heath',
      name: 'вересковая пустошь',
      kind: 'land',
      fantasy: false,
      color: [140, 128, 120],
      detail: 'grass',
      priority: 15,
      when: { moisture: [0.4, 0.45] },
    };
    const pack: PackManifest = {
      id: 'test',
      name: 'Тестовый пак',
      version: '0.0.1',
      biomes: [extra],
      overrides: { forest: { color: [100, 110, 90] } },
    };
    const list = resolveBiomes({ packs: ['base', 'test'] }, [BASE_PACK, pack]);
    expect(list.find((b) => b.id === 'forest')!.color).toEqual([100, 110, 90]);
    expect(list.map((b) => b.id)).toEqual([...OLD_ORDER, 'heath']);
    // Базовый пак не изменился.
    expect(resolveBiomes({}).find((b) => b.id === 'forest')!.color).not.toEqual([100, 110, 90]);
  });

  it('override неизвестного биома — ошибка', () => {
    const pack: PackManifest = { id: 'bad', name: 'x', version: '0', biomes: [], overrides: { nope: { priority: 1 } } };
    expect(() => resolveBiomes({ packs: ['base', 'bad'] }, [BASE_PACK, pack])).toThrow(/nope/);
  });
});

import { describe, expect, it } from 'vitest';
import { PACKS, resolveBiomes } from '../src/content/registry';
import { ru, translate } from '../src/i18n/ru';
import { LOAD_STEPS } from '../src/worker/protocol';

/** All content name keys: biomes of all packs (with fantasy), packs, generation stages. */
function contentKeys(): string[] {
  const keys: string[] = [];
  for (const pack of PACKS) {
    keys.push(pack.nameKey);
    for (const b of pack.biomes) keys.push(b.nameKey);
  }
  for (const b of resolveBiomes({ packs: PACKS.map((p) => p.id), fantasy: true })) keys.push(b.nameKey);
  for (const s of LOAD_STEPS) keys.push(`stage.${s}`, `stageShort.${s}`);
  return [...new Set(keys)];
}

describe('content i18n', () => {
  it('content names are keys, not ready-made text', () => {
    for (const pack of PACKS) {
      expect(pack.nameKey).toBe(`pack.${pack.id}`);
      for (const b of pack.biomes) expect(b.nameKey).toBe(`biome.${b.id}`);
    }
  });

  it('every content key has a translation in ru', () => {
    const missing = contentKeys().filter((k) => !(k in ru));
    expect(missing).toEqual([]);
  });

  it('translate: lookup by key, an unknown key is returned as is', () => {
    expect(translate('biome.mushroom_forest')).toBe('грибной лес');
    expect(translate('pack.base')).toBe('Базовый');
    expect(translate('нет.такого')).toBe('нет.такого');
  });
});

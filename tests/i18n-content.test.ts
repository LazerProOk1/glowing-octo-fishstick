import { describe, expect, it } from 'vitest';
import { PACKS, resolveBiomes } from '../src/content/registry';
import { ru, translate } from '../src/i18n/ru';
import { LOAD_STEPS } from '../src/worker/protocol';

/** Все ключи названий контента: биомы всех паков (с фэнтези), паки, этапы генерации. */
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

describe('i18n контента', () => {
  it('названия контента — ключи, а не готовый текст', () => {
    for (const pack of PACKS) {
      expect(pack.nameKey).toBe(`pack.${pack.id}`);
      for (const b of pack.biomes) expect(b.nameKey).toBe(`biome.${b.id}`);
    }
  });

  it('у каждого ключа контента есть перевод в ru', () => {
    const missing = contentKeys().filter((k) => !(k in ru));
    expect(missing).toEqual([]);
  });

  it('translate: перевод по ключу, неизвестный ключ возвращается как есть', () => {
    expect(translate('biome.mushroom_forest')).toBe('грибной лес');
    expect(translate('pack.base')).toBe('Базовый');
    expect(translate('нет.такого')).toBe('нет.такого');
  });
});

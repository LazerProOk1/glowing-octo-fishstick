// Сборка паков в список биомов мира. Паки подключаются статическим импортом.
import {
  DETAIL_SLOT_NAMES,
  MAX_BIOMES,
  type BiomeConditions,
  type BiomeDef,
  type BiomeTag,
  type GenOptions,
  type PackManifest,
} from './biomes/types';
import { hsl } from './color';
import { BASE_PACK } from './packs/base/manifest';

/** Все известные паки. Новый пак: src/content/packs/<id>/manifest.ts и строка здесь. */
export const PACKS: readonly PackManifest[] = [BASE_PACK];

export const DEFAULT_PACKS: readonly string[] = ['base'];

export function hasTag(def: BiomeDef, tag: BiomeTag): boolean {
  return def.tags?.includes(tag) ?? false;
}

/** Запасной биом своего вида: без условий, подходит любой клетке. */
export function isFallback(def: BiomeDef): boolean {
  const w: BiomeConditions = def.when;
  return w.height === undefined && w.temperature === undefined && w.moisture === undefined && w.arcana === undefined;
}

/** Без этих биомов мир не собрать: запасной биом суши, глубокая и мелкая вода. */
export function isRequired(def: BiomeDef): boolean {
  return (def.kind === 'land' && isFallback(def)) || hasTag(def, 'deepWater') || hasTag(def, 'shallowWater');
}

/** Проверка одного биома; бросает ошибку с id биома. */
export function validateBiome(def: BiomeDef): void {
  const fail = (what: string): never => {
    throw new Error(`биом «${def.id}»: ${what}`);
  };
  if (!/^[a-z][a-z0-9_]*$/.test(def.id)) fail('id — латиница snake_case');
  // Название — ключ i18n (перевод в src/i18n/ru.ts), не готовый текст.
  if (!/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(def.nameKey)) fail(`название — ключ i18n вида biome.${def.id}`);
  if (def.kind !== 'water' && def.kind !== 'land') fail(`неизвестный вид ${String(def.kind)}`);
  if (def.color.length !== 3 || def.color.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) {
    fail('цвет — три целых 0..255');
  }
  const { s, l } = hsl(def.color);
  if (s > 0.45) fail('цвет слишком насыщен (насыщенность HSL > 0.45)');
  if (l < 0.2 || l > 0.9) fail('цвет слишком тёмный или светлый (светлота HSL вне 0.2..0.9)');
  if (!(DETAIL_SLOT_NAMES as readonly string[]).includes(def.detail)) fail(`нет слота атласа «${def.detail}»`);
  if (!Number.isFinite(def.priority)) fail('приоритет — конечное число');
  for (const [k, r] of Object.entries(def.when) as Array<[string, readonly [number, number] | undefined]>) {
    if (r === undefined) continue;
    if (!(r[0] < r[1])) fail(`условие ${k}: нужно min < max`);
  }
}

/**
 * Включённые биомы мира в порядке кодов: биомы паков по порядку паков и объявления,
 * правки (overrides) применяются по порядку паков; без фэнтези фэнтези-биомы отбрасываются;
 * выключенные убираются (их ниша достаётся следующему подходящему по приоритету).
 */
export function resolveBiomes(options: GenOptions = {}, available: readonly PackManifest[] = PACKS): BiomeDef[] {
  const byId = new Map<string, BiomeDef>();
  for (const packId of options.packs ?? DEFAULT_PACKS) {
    const pack = available.find((p) => p.id === packId);
    if (!pack) throw new Error(`неизвестный пак «${packId}»`);
    for (const b of pack.biomes) {
      if (byId.has(b.id)) throw new Error(`пак «${pack.id}»: биом «${b.id}» уже объявлен, используйте overrides`);
      byId.set(b.id, b);
    }
    for (const [id, patch] of Object.entries(pack.overrides ?? {})) {
      const old = byId.get(id);
      if (!old) throw new Error(`пак «${pack.id}»: override неизвестного биома «${id}»`);
      byId.set(id, { ...old, ...patch, id });
    }
  }
  // Все объявленные биомы (после правок), а не только включённые: ошибка в данных пака
  // видна сразу, а не когда биом впервые включат.
  for (const def of byId.values()) validateBiome(def);
  const disabled = new Set(options.disabledBiomes ?? []);
  for (const id of disabled) {
    const def = byId.get(id);
    if (!def) throw new Error(`нельзя выключить неизвестный биом «${id}»`);
    if (isRequired(def)) throw new Error(`биом «${id}» нельзя выключить: без него мир не собрать`);
  }
  const list = [...byId.values()].filter((b) => (options.fantasy || !b.fantasy) && !disabled.has(b.id));
  if (list.length > MAX_BIOMES) throw new Error(`слишком много биомов: ${list.length} (максимум ${MAX_BIOMES})`);
  for (const kind of ['land', 'water'] as const) {
    const fallbacks = list.filter((b) => b.kind === kind && isFallback(b));
    if (fallbacks.length !== 1) {
      throw new Error(`нужен ровно один запасной биом вида ${kind} без условий, а их ${fallbacks.length}`);
    }
  }
  for (const tag of ['deepWater', 'shallowWater'] as const) {
    if (!list.some((b) => b.kind === 'water' && hasTag(b, tag))) throw new Error(`нет водного биома с тегом ${tag}`);
  }
  return list;
}

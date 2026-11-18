// Схема биома как данных. Биомы мира собираются из паков (src/content/registry.ts);
// генератор и рендер опираются на поля и теги, а не на имена биомов.

/** Слоты атласа деталей (assets/terrain/atlas.png); индекс в массиве — номер слота. */
export const DETAIL_SLOT_NAMES = ['grass', 'forest', 'sand', 'rock', 'snow', 'mud', 'paper'] as const;
export type DetailSlotName = (typeof DETAIL_SLOT_NAMES)[number];

/** Полуинтервал [min, max): min включительно, max не включительно; ±Infinity допустимы. */
export type Range = readonly [min: number, max: number];

/**
 * Роли, на которые опирается генератор. `lake` — вода озёр: такой биом не выбирается по условиям
 * `when`, его получают клетки замкнутых внутренних водоёмов (src/sim/world/lakes.ts).
 */
export type BiomeTag = 'mountain' | 'hill' | 'deepWater' | 'shallowWater' | 'lake';

/** Поля мира, по которым выбирается биом. */
export interface BiomeConditions {
  /** Высота 0..1, уровень моря 0.5. */
  height?: Range;
  /** Температура, °C. */
  temperature?: Range;
  /** Влажность 0..1. */
  moisture?: Range;
  /** «Магичность» 0..1: низкочастотный шум, задаёт пятна фэнтези-биомов. */
  arcana?: Range;
}

export interface BiomeDef {
  /** Латиница snake_case, уникален: 'mushroom_forest'. */
  id: string;
  /** Ключ i18n названия: 'biome.mushroom_forest' (перевод — в src/i18n/ru.ts). */
  nameKey: string;
  /** Вода выбирается только на клетках не выше уровня моря, суша — только выше. */
  kind: 'water' | 'land';
  /** Включается только в мире с фэнтези. */
  fantasy: boolean;
  /** sRGB 0..255, насыщенность HSL ≤ 0.45. */
  color: readonly [number, number, number];
  /** Слот атласа деталей (яркостная текстура поверх цвета). */
  detail: DetailSlotName;
  /** Больше — проверяется раньше. */
  priority: number;
  /** Пусто — подходит всё (запасной биом своего вида). */
  when: BiomeConditions;
  tags?: readonly BiomeTag[];
  /** Задел на будущее, пока не используется. */
  modifiers?: { defense?: number; moveCost?: number };
}

export interface PackManifest {
  id: string;
  /** Ключ i18n названия пака: 'pack.base'. */
  nameKey: string;
  version: string;
  biomes: BiomeDef[];
  /** Правки биомов, объявленных этим или предыдущими паками (по id). */
  overrides?: Record<string, Partial<Omit<BiomeDef, 'id'>>>;
}

export interface GenOptions {
  /** Паки по порядку; по умолчанию ['base']. */
  packs?: string[];
  /** Включить фэнтези-биомы; по умолчанию false. */
  fantasy?: boolean;
  /** id выключенных биомов: их ниша достаётся следующему подходящему по приоритету. */
  disabledBiomes?: string[];
}

/** Код биома хранится в Uint8Array и упаковывается в 5 бит классов провинций. */
export const MAX_BIOMES = 32;

/**
 * Наименьшее число double, большее x. Строгое «x > a» из старого решающего списка
 * записывается полуинтервалом [above(a), …): для чисел double это одно и то же.
 */
export function above(x: number): number {
  if (Number.isNaN(x) || x === Infinity) return x;
  if (x === 0) return Number.MIN_VALUE;
  const f = new Float64Array([x]);
  const u = new BigInt64Array(f.buffer);
  u[0] = u[0]! + (x > 0 ? 1n : -1n);
  return f[0]!;
}

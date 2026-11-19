// Biome schema as data. World biomes are assembled from packs (src/content/registry.ts);
// the generator and renderer rely on fields and tags, not on biome names.

/** Detail atlas slots (assets/terrain/atlas.png); the array index is the slot number. */
export const DETAIL_SLOT_NAMES = ['grass', 'forest', 'sand', 'rock', 'snow', 'mud', 'paper'] as const;
export type DetailSlotName = (typeof DETAIL_SLOT_NAMES)[number];

/** Half-open interval [min, max): min inclusive, max exclusive; ±Infinity is allowed. */
export type Range = readonly [min: number, max: number];

/**
 * Roles the generator relies on. `lake` — lake water: such a biome is never chosen by `when`
 * conditions; cells of closed inland water bodies get it (src/sim/world/lakes.ts).
 */
export type BiomeTag = 'mountain' | 'hill' | 'deepWater' | 'shallowWater' | 'lake';

/** World fields used to choose a biome. */
export interface BiomeConditions {
  /** Height 0..1, sea level 0.5. */
  height?: Range;
  /** Temperature, °C. */
  temperature?: Range;
  /** Moisture 0..1. */
  moisture?: Range;
  /** "Arcana" 0..1: low-frequency noise that shapes the fantasy biome patches. */
  arcana?: Range;
}

export interface BiomeDef {
  /** Latin snake_case, unique: 'mushroom_forest'. */
  id: string;
  /** i18n key of the name: 'biome.mushroom_forest' (translation in src/i18n/ru.ts). */
  nameKey: string;
  /** Water is chosen only on cells at or below sea level, land only above it. */
  kind: 'water' | 'land';
  /** Enabled only in a world with fantasy. */
  fantasy: boolean;
  /** sRGB 0..255, HSL saturation ≤ 0.45. */
  color: readonly [number, number, number];
  /** Detail atlas slot (a luminance texture over the colour). */
  detail: DetailSlotName;
  /** Higher values are checked first. */
  priority: number;
  /** Empty means everything matches (the fallback biome of its kind). */
  when: BiomeConditions;
  tags?: readonly BiomeTag[];
  /** Groundwork for the future, unused for now. */
  modifiers?: { defense?: number; moveCost?: number };
}

export interface PackManifest {
  id: string;
  /** i18n key of the pack name: 'pack.base'. */
  nameKey: string;
  version: string;
  biomes: BiomeDef[];
  /** Edits to biomes declared by this or earlier packs (by id). */
  overrides?: Record<string, Partial<Omit<BiomeDef, 'id'>>>;
}

export interface GenOptions {
  /** Packs in order; default ['base']. */
  packs?: string[];
  /** Enable fantasy biomes; default false. */
  fantasy?: boolean;
  /** Ids of disabled biomes: their niche goes to the next biome by priority. */
  disabledBiomes?: string[];
}

/** The biome code is stored in a Uint8Array and packed into 5 bits of the province classes. */
export const MAX_BIOMES = 32;

/**
 * The smallest double greater than x. A strict "x > a" from the old decision list is
 * written as the half-open interval [above(a), …): for doubles that is the same thing.
 */
export function above(x: number): number {
  if (Number.isNaN(x) || x === Infinity) return x;
  if (x === 0) return Number.MIN_VALUE;
  const f = new Float64Array([x]);
  const u = new BigInt64Array(f.buffer);
  u[0] = u[0]! + (x > 0 ? 1n : -1n);
  return f[0]!;
}

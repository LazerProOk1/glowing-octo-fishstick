// Assembly of packs into the world biome list. Packs are wired up by static import.
import {
  DETAIL_SLOT_NAMES,
  MAX_BIOMES,
  type BiomeConditions,
  type BiomeDef,
  type BiomeTag,
  type GenOptions,
  type PackManifest,
} from './biomes/types';
import { CodedError } from './errors';
import { hsl } from './color';
import { BASE_PACK } from './packs/base/manifest';

/** Pack validation error: one generic code, the English reason (with ids) is the param. */
const packError = (reason: string): CodedError => new CodedError('invalid_pack', { reason });

/** All known packs. A new pack: src/content/packs/<id>/manifest.ts plus a line here. */
export const PACKS: readonly PackManifest[] = [BASE_PACK];

export const DEFAULT_PACKS: readonly string[] = ['base'];

export function hasTag(def: BiomeDef, tag: BiomeTag): boolean {
  return def.tags?.includes(tag) ?? false;
}

/** Water classification shared by the render encoders (bake alpha, palette slot). */
export function waterKind(def: BiomeDef): 'land' | 'sea' | 'lake' {
  return hasTag(def, 'lake') ? 'lake' : def.kind === 'water' ? 'sea' : 'land';
}

/** Fallback biome of its kind: no conditions, matches any cell (the lake biome is not a fallback). */
export function isFallback(def: BiomeDef): boolean {
  const w: BiomeConditions = def.when;
  return !hasTag(def, 'lake') && w.height === undefined && w.temperature === undefined && w.moisture === undefined && w.arcana === undefined;
}

/** The world cannot be assembled without these: a land fallback, deep and shallow water, lakes. */
export function isRequired(def: BiomeDef): boolean {
  return (
    (def.kind === 'land' && isFallback(def)) ||
    hasTag(def, 'deepWater') ||
    hasTag(def, 'shallowWater') ||
    hasTag(def, 'lake')
  );
}

/** Validation of one biome; throws an error with the biome id. */
export function validateBiome(def: BiomeDef): void {
  const fail = (what: string): never => {
    throw packError(`biome "${def.id}": ${what}`);
  };
  if (!/^[a-z][a-z0-9_]*$/.test(def.id)) fail('id must be latin snake_case');
  // The name is an i18n key (translation in src/i18n/ru.ts), not ready-made text.
  if (!/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(def.nameKey)) fail(`name must be an i18n key like biome.${def.id}`);
  if (def.kind !== 'water' && def.kind !== 'land') fail(`unknown kind ${String(def.kind)}`);
  if (def.color.length !== 3 || def.color.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) {
    fail('color must be three integers 0..255');
  }
  const { s, l } = hsl(def.color);
  if (s > 0.45) fail('color is too saturated (HSL saturation > 0.45)');
  if (l < 0.2 || l > 0.9) fail('color is too dark or too light (HSL lightness outside 0.2..0.9)');
  if (!(DETAIL_SLOT_NAMES as readonly string[]).includes(def.detail)) fail(`no atlas slot "${def.detail}"`);
  if (!Number.isFinite(def.priority)) fail('priority must be a finite number');
  if (hasTag(def, 'lake') && def.kind !== 'water') fail('a biome with the lake tag must be water');
  for (const [k, r] of Object.entries(def.when) as Array<[string, readonly [number, number] | undefined]>) {
    if (r === undefined) continue;
    if (!(r[0] < r[1])) fail(`condition ${k}: min must be < max`);
  }
}

/**
 * Enabled world biomes in code order: pack biomes in pack and declaration order,
 * overrides applied in pack order; without fantasy the fantasy biomes are dropped;
 * disabled ones are removed (their niche goes to the next biome by priority).
 */
export function resolveBiomes(options: GenOptions = {}, available: readonly PackManifest[] = PACKS): BiomeDef[] {
  const byId = new Map<string, BiomeDef>();
  for (const packId of options.packs ?? DEFAULT_PACKS) {
    const pack = available.find((p) => p.id === packId);
    if (!pack) throw packError(`unknown pack "${packId}"`);
    for (const b of pack.biomes) {
      if (byId.has(b.id)) throw packError(`pack "${pack.id}": biome "${b.id}" is already declared, use overrides`);
      byId.set(b.id, b);
    }
    for (const [id, patch] of Object.entries(pack.overrides ?? {})) {
      const old = byId.get(id);
      if (!old) throw packError(`pack "${pack.id}": override of unknown biome "${id}"`);
      byId.set(id, { ...old, ...patch, id });
    }
  }
  // All declared biomes (after overrides), not only the enabled ones: a mistake in pack data
  // shows up right away instead of when the biome is first enabled.
  for (const def of byId.values()) validateBiome(def);
  const disabled = new Set(options.disabledBiomes ?? []);
  for (const id of disabled) {
    const def = byId.get(id);
    if (!def) throw packError(`cannot disable unknown biome "${id}"`);
    if (isRequired(def)) throw packError(`biome "${id}" cannot be disabled: the world cannot be built without it`);
  }
  const list = [...byId.values()].filter((b) => (options.fantasy || !b.fantasy) && !disabled.has(b.id));
  if (list.length > MAX_BIOMES) throw packError(`too many biomes: ${list.length} (max ${MAX_BIOMES})`);
  for (const kind of ['land', 'water'] as const) {
    const fallbacks = list.filter((b) => b.kind === kind && isFallback(b));
    if (fallbacks.length !== 1) {
      throw packError(`exactly one fallback ${kind} biome without conditions is needed, found ${fallbacks.length}`);
    }
  }
  for (const tag of ['deepWater', 'shallowWater', 'lake'] as const) {
    if (!list.some((b) => b.kind === 'water' && hasTag(b, tag))) throw packError(`no water biome with tag ${tag}`);
  }
  return list;
}

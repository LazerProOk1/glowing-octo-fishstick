import type { BiomeDef } from '../content/biomes/types';
import { CodedError } from '../content/errors';
import { hasTag } from '../content/registry';
import type { World } from '../sim/world/types';

export function encodeProvinceId(id: number): [r: number, g: number] {
  return [id & 255, id >> 8];
}

export function decodeProvinceId(r: number, g: number): number {
  return r | (g << 8);
}

export interface BakedTextures {
  /** RGBA: R,G = province id, B = 255 on land, A = 255. */
  provinceRG: Uint8Array;
  /** RGBA: R height, G biome code, B moisture, A river width * 63. */
  terrain: Uint8Array;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * owner — province id of each cell for display (provinceOf by default; the renderer passes
 * displayProvinceOf from bakeWorld.ts). The shader builds province borders itself from the id maps
 * (soft share, see softProvince.ts), so no distance-to-border field is baked.
 */
export function bakeTextures(world: World, owner: Uint16Array = world.provinceOf): BakedTextures {
  const n = world.w * world.h;
  const provinceRG = provinceIdPixels(owner, world.provinces);
  const terrain = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) writeTerrainCell(terrain, world, i);
  return { provinceRG, terrain };
}

/**
 * RGBA pixels of the owner map (provinceRG layout): R,G — id, B — 255 for a land province,
 * A — 255. An unknown id is an error.
 */
export function provinceIdPixels(owner: Uint16Array, provinces: readonly Pick<World['provinces'][number], 'isLand'>[]): Uint8Array {
  const out = new Uint8Array(owner.length * 4);
  // Land by province id computed up front: no province object lookup in a loop over 2M cells.
  const landOf = new Uint8Array(provinces.length);
  provinces.forEach((p, id) => (landOf[id] = p.isLand ? 255 : 0));
  for (let i = 0; i < owner.length; i++) {
    const o = i * 4;
    const id = owner[i] as number;
    if (id >= provinces.length) throw new CodedError('no_province', { id, cell: i });
    out[o] = id & 255;
    out[o + 1] = id >> 8;
    out[o + 2] = landOf[id] as number;
    out[o + 3] = 255;
  }
  return out;
}

/**
 * Alpha channel of the water owner map (provinceSeaRG): water kind by the cell's own biome — land,
 * sea or lake. The shader (lakeShare in mapShader.ts) reads it from the same 16 texels as the soft
 * province share and makes no separate biome-code or palette lookups. In provinceRG alpha stays 255.
 */
export const SEA_MAP_ALPHA = { land: 255, sea: 128, lake: 0 } as const;

/** SEA_MAP_ALPHA by biome code (the same mapping as the palette slots in paletteData, textures.ts). */
export function waterClassTable(defs: readonly BiomeDef[]): number[] {
  return defs.map((d) =>
    hasTag(d, 'lake') ? SEA_MAP_ALPHA.lake : d.kind === 'water' ? SEA_MAP_ALPHA.sea : SEA_MAP_ALPHA.land,
  );
}

/** Alpha of cell i by its biome; table is waterClassTable. An unknown biome code is an error. */
export function writeWaterClassCell(pixels: Uint8Array, biome: Uint8Array, table: readonly number[], i: number): void {
  const c = table[biome[i] as number];
  if (c === undefined) throw new CodedError('no_biome_code', { code: biome[i] ?? -1, cell: i });
  pixels[i * 4 + 3] = c;
}

/** Writes SEA_MAP_ALPHA into the alpha of the RGBA pixels by each cell's biome. */
export function writeWaterClass(pixels: Uint8Array, biome: Uint8Array, defs: readonly BiomeDef[]): void {
  const table = waterClassTable(defs);
  for (let i = 0; i < biome.length; i++) writeWaterClassCell(pixels, biome, table, i);
}

/** One terrain texture pixel (RGBA: height, biome code, moisture, river width · 63). */
export function writeTerrainCell(
  terrain: Uint8Array,
  world: Pick<World, 'height' | 'biome' | 'moisture' | 'riverMask'>,
  i: number,
): void {
  const o = i * 4;
  terrain[o] = clampByte(Math.round((world.height[i] as number) * 255));
  terrain[o + 1] = world.biome[i] as number;
  terrain[o + 2] = clampByte(Math.round((world.moisture[i] as number) * 255));
  terrain[o + 3] = Math.min(252, (world.riverMask[i] as number) * 63);
}

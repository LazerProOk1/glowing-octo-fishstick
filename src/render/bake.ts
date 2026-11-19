import type { BiomeDef } from '../content/biomes/types';
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
 * owner — id провинции каждой клетки для показа (по умолчанию provinceOf; рендер передаёт
 * displayProvinceOf из bakeWorld.ts). Границы провинций шейдер строит сам по картам id
 * (мягкая доля, см. softProvince.ts), поэтому поле расстояний до границ не запекается.
 */
export function bakeTextures(world: World, owner: Uint16Array = world.provinceOf): BakedTextures {
  const n = world.w * world.h;
  const provinceRG = provinceIdPixels(owner, world.provinces);
  const terrain = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) writeTerrainCell(terrain, world, i);
  return { provinceRG, terrain };
}

/**
 * RGBA-пиксели карты владельцев (раскладка provinceRG): R,G — id, B — 255 у сухопутной провинции,
 * A — 255. Неизвестный id — ошибка.
 */
export function provinceIdPixels(owner: Uint16Array, provinces: readonly Pick<World['provinces'][number], 'isLand'>[]): Uint8Array {
  const out = new Uint8Array(owner.length * 4);
  // Суша по id провинции заранее: без поиска объекта провинции в цикле по 2 млн клеток.
  const landOf = new Uint8Array(provinces.length);
  provinces.forEach((p, id) => (landOf[id] = p.isLand ? 255 : 0));
  for (let i = 0; i < owner.length; i++) {
    const o = i * 4;
    const id = owner[i] as number;
    if (id >= provinces.length) throw new Error(`нет провинции с id ${id} (клетка ${i})`);
    out[o] = id & 255;
    out[o + 1] = id >> 8;
    out[o + 2] = landOf[id] as number;
    out[o + 3] = 255;
  }
  return out;
}

/**
 * Канал A карты владельцев воды (provinceSeaRG): вид воды по биому самой клетки — суша, море или
 * озеро. Шейдер (lakeShare в mapShader.ts) читает его из тех же 16 текселей, что и мягкую долю
 * провинций, и не делает отдельных выборок кода биома и палитры. У provinceRG канал A остаётся 255.
 */
export const SEA_MAP_ALPHA = { land: 255, sea: 128, lake: 0 } as const;

/** SEA_MAP_ALPHA по коду биома (тот же разбор, что слоты палитры в paletteData, textures.ts). */
export function waterClassTable(defs: readonly BiomeDef[]): number[] {
  return defs.map((d) =>
    hasTag(d, 'lake') ? SEA_MAP_ALPHA.lake : d.kind === 'water' ? SEA_MAP_ALPHA.sea : SEA_MAP_ALPHA.land,
  );
}

/** Канал A клетки i по её биому; table — waterClassTable. Неизвестный код биома — ошибка. */
export function writeWaterClassCell(pixels: Uint8Array, biome: Uint8Array, table: readonly number[], i: number): void {
  const c = table[biome[i] as number];
  if (c === undefined) throw new Error(`нет биома с кодом ${biome[i]} (клетка ${i})`);
  pixels[i * 4 + 3] = c;
}

/** Записывает SEA_MAP_ALPHA в канал A RGBA-пикселей по биому каждой клетки. */
export function writeWaterClass(pixels: Uint8Array, biome: Uint8Array, defs: readonly BiomeDef[]): void {
  const table = waterClassTable(defs);
  for (let i = 0; i < biome.length; i++) writeWaterClassCell(pixels, biome, table, i);
}

/** Один пиксель текстуры terrain (RGBA: высота, код биома, влажность, ширина реки · 63). */
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

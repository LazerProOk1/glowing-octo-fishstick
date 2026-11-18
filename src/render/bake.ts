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

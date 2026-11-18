import type { World } from '../sim/world/types';
import { borderDistance } from '../sim/geom/edt';

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
  /** RGBA: R = border distance * 32 (clamped), G = country border (later), A = 255. */
  border: Uint8Array;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * owner — id провинции каждой клетки для показа (по умолчанию provinceOf; рендер передаёт
 * displayProvinceOf из bakeWorld.ts). По нему же считаются расстояния до границ.
 */
export function bakeTextures(world: World, owner: Uint16Array = world.provinceOf): BakedTextures {
  const { w, h, provinces } = world;
  const n = w * h;
  const dist = borderDistance(owner, w, h);
  const provinceRG = new Uint8Array(n * 4);
  const terrain = new Uint8Array(n * 4);
  const border = new Uint8Array(n * 4);
  // Суша по id провинции заранее: без поиска объекта провинции в цикле по 2 млн клеток.
  const landOf = new Uint8Array(provinces.length);
  provinces.forEach((p, id) => (landOf[id] = p.isLand ? 255 : 0));
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const id = owner[i] as number;
    if (id >= provinces.length) throw new Error(`нет провинции с id ${id} (клетка ${i})`);
    const [r, g] = encodeProvinceId(id);
    provinceRG[o] = r;
    provinceRG[o + 1] = g;
    provinceRG[o + 2] = landOf[id] as number;
    provinceRG[o + 3] = 255;
    writeTerrainCell(terrain, world, i);
    border[o] = Math.min(255, Math.round((dist[i] as number) * 32));
    border[o + 3] = 255;
  }
  return { provinceRG, terrain, border };
}

/** id провинции каждой клетки обратно из RGBA-пикселей provinceRG. */
export function decodeProvinceIds(provinceRG: Uint8Array): Uint16Array {
  const out = new Uint16Array(provinceRG.length / 4);
  for (let i = 0; i < out.length; i++) {
    out[i] = decodeProvinceId(provinceRG[i * 4] as number, provinceRG[i * 4 + 1] as number);
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

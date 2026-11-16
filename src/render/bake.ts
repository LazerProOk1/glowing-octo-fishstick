import { SEA_LEVEL, type World } from '../sim/world/types';
import { borderDistance } from './distanceField';

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

export function bakeTextures(world: World): BakedTextures {
  const { w, h, provinceOf, provinces, height, biome, moisture, riverMask } = world;
  const n = w * h;
  const dist = borderDistance(provinceOf, w, h);
  const provinceRG = new Uint8Array(n * 4);
  const terrain = new Uint8Array(n * 4);
  const border = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const id = provinceOf[i] as number;
    const [r, g] = encodeProvinceId(id);
    provinceRG[o] = r;
    provinceRG[o + 1] = g;
    const land = provinces[id]?.isLand ?? (height[i] as number) > SEA_LEVEL;
    provinceRG[o + 2] = land ? 255 : 0;
    provinceRG[o + 3] = 255;
    terrain[o] = Math.round((height[i] as number) * 255);
    terrain[o + 1] = biome[i] as number;
    terrain[o + 2] = Math.round((moisture[i] as number) * 255);
    terrain[o + 3] = Math.min(252, (riverMask[i] as number) * 63);
    border[o] = Math.min(255, Math.round((dist[i] as number) * 32));
    border[o + 3] = 255;
  }
  return { provinceRG, terrain, border };
}

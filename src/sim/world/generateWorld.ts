import { createRng } from '../rng';
import { computeBiomes } from './biomes';
import { computeClimate } from './climate';
import { generateHeight } from './heightmap';
import { computeProvinces } from './provinces';
import { computeRivers } from './rivers';
import { normalizeShoreline } from './shoreline';
import { WORLD_H, WORLD_W, type World } from './types';

/** Province ids are stored in Uint16Array / two texture channels. */
export const MAX_PROVINCES = 65535;

export function assertProvinceCount(n: number): void {
  if (n > MAX_PROVINCES) {
    throw new Error(`слишком много провинций: ${n} (максимум ${MAX_PROVINCES})`);
  }
}

export function generateWorld(seed: string): World {
  const w = WORLD_W;
  const h = WORLD_H;
  const rng = createRng(seed);
  const rawHeight = generateHeight(rng.fork('height'), w, h);
  const { temperature, moisture } = computeClimate(rng.fork('climate'), rawHeight, w, h);
  const rawBiomes = computeBiomes(rawHeight, temperature, moisture);
  const { height, biomes } = normalizeShoreline(rawHeight, rawBiomes, w, h);
  const { rivers, riverMask } = computeRivers(height, moisture, w, h);
  const { provinceOf, provinces } = computeProvinces(
    rng.fork('provinces'),
    height,
    biomes,
    riverMask,
    w,
    h,
  );
  assertProvinceCount(provinces.length);
  return {
    seed,
    w,
    h,
    height,
    temperature,
    moisture,
    biome: biomes,
    riverMask,
    rivers,
    provinceOf,
    provinces,
  };
}

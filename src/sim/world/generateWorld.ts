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

/** Этапы генерации в порядке выполнения. */
export const GEN_STAGES = ['height', 'climate', 'biomes', 'shoreline', 'rivers', 'provinces'] as const;
export type GenStage = (typeof GEN_STAGES)[number];

/**
 * @param onStage вызывается перед каждым этапом (для экрана загрузки и замеров в воркере;
 *   само ядро время не измеряет).
 * @param onSurface вызывается, как только высота и биомы окончательны (после этапа берегов):
 *   воркер отдаёт их на параллельное запекание текстур. Массивы дальше не меняются.
 */
export function generateWorld(
  seed: string,
  onStage?: (stage: GenStage) => void,
  onSurface?: (height: Float32Array, biome: Uint8Array) => void,
): World {
  const w = WORLD_W;
  const h = WORLD_H;
  const rng = createRng(seed);
  onStage?.('height');
  const rawHeight = generateHeight(rng.fork('height'), w, h);
  onStage?.('climate');
  const { temperature, moisture } = computeClimate(rng.fork('climate'), rawHeight, w, h);
  onStage?.('biomes');
  const rawBiomes = computeBiomes(rawHeight, temperature, moisture);
  onStage?.('shoreline');
  const { height, biomes } = normalizeShoreline(rawHeight, rawBiomes, w, h);
  onSurface?.(height, biomes);
  onStage?.('rivers');
  const { rivers, riverMask } = computeRivers(height, moisture, w, h);
  onStage?.('provinces');
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

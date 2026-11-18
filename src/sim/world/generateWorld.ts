import type { BiomeDef, GenOptions } from '../../content/biomes/types';
import { resolveBiomes } from '../../content/registry';
import { createRng } from '../rng';
import { computeBiomes } from './biomes';
import { computeArcana, computeClimate } from './climate';
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
 * @param options паки, фэнтези и выключенные биомы (по умолчанию — базовый пак без фэнтези).
 * @param onStage вызывается перед каждым этапом (для экрана загрузки и замеров в воркере;
 *   само ядро время не измеряет).
 * @param onSurface вызывается, как только высота и биомы окончательны (после этапа берегов):
 *   воркер отдаёт их на параллельное запекание текстур (вместе со списком биомов мира).
 *   Массивы дальше не меняются.
 */
export function generateWorld(
  seed: string,
  options: GenOptions = {},
  onStage?: (stage: GenStage) => void,
  onSurface?: (height: Float32Array, biome: Uint8Array, defs: BiomeDef[]) => void,
): World {
  const w = WORLD_W;
  const h = WORLD_H;
  const defs = resolveBiomes(options);
  const rng = createRng(seed);
  onStage?.('height');
  const rawHeight = generateHeight(rng.fork('height'), w, h);
  onStage?.('climate');
  const { temperature, moisture } = computeClimate(rng.fork('climate'), rawHeight, w, h);
  // Отдельный поток ГСЧ: включение фэнтези не меняет остальные поля мира.
  const arcana = computeArcana(seed, w, h);
  onStage?.('biomes');
  const rawBiomes = computeBiomes(defs, rawHeight, temperature, moisture, arcana);
  onStage?.('shoreline');
  const { height, biomes } = normalizeShoreline(rawHeight, rawBiomes, w, h, defs);
  onSurface?.(height, biomes, defs);
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
    defs,
  );
  assertProvinceCount(provinces.length);
  return {
    seed,
    w,
    h,
    height,
    temperature,
    moisture,
    arcana,
    biomes: defs,
    biome: biomes,
    riverMask,
    rivers,
    provinceOf,
    provinces,
  };
}

import type { BiomeDef } from '../../content/biomes/types';
import { resolveBiomes } from '../../content/registry';
import { createRng } from '../rng';
import { computeAdjacency } from './adjacency';
import { computeBiomes } from './biomes';
import { computeArcana, computeClimate } from './climate';
import { generateHeight } from './heightmap';
import { applyLakeBiome, findLakes } from './lakes';
import { GEN_VERSION, genOptionsOf, SIZE_PRESETS, type WorldParams, type WorldSize } from './params';
import { computeProvinces } from './provinces';
import { computeRivers } from './rivers';
import { normalizeShoreline } from './shoreline';
import type { World } from './types';

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
 * @param params сид, паки, фэнтези, выключенные биомы и размер; записываются в мир как есть.
 *   genVersion должен совпадать с GEN_VERSION: старый мир этой версией не воспроизвести — ошибка.
 * @param onStage вызывается перед каждым этапом (для экрана загрузки и замеров в воркере;
 *   само ядро время не измеряет).
 * @param onSurface вызывается, как только высота и биомы окончательны (после этапа берегов):
 *   воркер отдаёт их на параллельное запекание текстур (вместе со списком биомов мира и размером).
 *   Массивы дальше не меняются.
 */
export function generateWorld(
  params: WorldParams,
  onStage?: (stage: GenStage) => void,
  onSurface?: (height: Float32Array, biome: Uint8Array, defs: BiomeDef[], w: number, h: number) => void,
): World {
  if (params.genVersion !== GEN_VERSION) {
    throw new Error(`мир описан для версии генератора ${params.genVersion}, а текущая — ${GEN_VERSION}`);
  }
  const preset = SIZE_PRESETS[params.options.size] as (typeof SIZE_PRESETS)[WorldSize] | undefined;
  if (!preset) throw new Error(`неизвестный размер мира «${String(params.options.size)}»`);
  const { w, h } = preset;
  const { seed } = params;
  const defs = resolveBiomes(genOptionsOf(params));
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
  const shore = normalizeShoreline(rawHeight, rawBiomes, w, h, defs);
  const { height } = shore;
  // Озёра — часть этапа берегов: биом озёр должен попасть в запекание поверхности.
  const lake = findLakes(height, w, h);
  const biomes = applyLakeBiome(shore.biomes, lake, defs);
  onSurface?.(height, biomes, defs, w, h);
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
    lake,
  );
  assertProvinceCount(provinces.length);
  // Соседство — часть этапа провинций (десятки мс).
  const { adjacency, edgesOf } = computeAdjacency(provinceOf, provinces, height, riverMask, w, h);
  return {
    params: structuredClone(params),
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
    adjacency,
    edgesOf,
  };
}

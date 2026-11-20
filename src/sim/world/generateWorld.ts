import type { BiomeDef } from '../../content/biomes/types';
import { CodedError } from '../../content/errors';
import { resolveBiomes } from '../../content/registry';
import { createRng } from '../rng';
import { computeAdjacency } from './adjacency';
import { classifyMoistureJitter, classifyTemperatureJitter, computeBiomes } from './biomes';
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
    throw new CodedError('too_many_provinces', { n, max: MAX_PROVINCES });
  }
}

/** Generation stages in execution order. */
export const GEN_STAGES = ['height', 'climate', 'biomes', 'shoreline', 'rivers', 'provinces'] as const;
export type GenStage = (typeof GEN_STAGES)[number];

/**
 * @param params seed, packs, fantasy, disabled biomes and size; stored in the world as is.
 *   genVersion must match GEN_VERSION: an old world cannot be reproduced by this version — error.
 * @param onStage called before each stage (for the loading screen and worker timings;
 *   the core itself does not measure time).
 * @param onSurface called as soon as height and biomes are final (after the shores stage):
 *   the worker hands them to parallel texture baking (together with the world biome list and size).
 *   The arrays do not change afterwards.
 */
export function generateWorld(
  params: WorldParams,
  onStage?: (stage: GenStage) => void,
  onSurface?: (height: Float32Array, biome: Uint8Array, defs: BiomeDef[], w: number, h: number) => void,
): World {
  if (params.genVersion !== GEN_VERSION) {
    throw new CodedError('gen_version_mismatch', { world: params.genVersion, current: GEN_VERSION });
  }
  const preset = SIZE_PRESETS[params.options.size] as (typeof SIZE_PRESETS)[WorldSize] | undefined;
  if (!preset) throw new CodedError('unknown_world_size', { size: String(params.options.size) });
  const { w, h } = preset;
  const { seed } = params;
  const defs = resolveBiomes(genOptionsOf(params));
  const rng = createRng(seed);
  onStage?.('height');
  const rawHeight = generateHeight(rng.fork('height'), w, h);
  onStage?.('climate');
  const { temperature, moisture } = computeClimate(rng.fork('climate'), rawHeight, w, h);
  // Separate RNG stream: enabling fantasy does not change the other world fields.
  const arcana = computeArcana(seed, w, h);
  onStage?.('biomes');
  // Jittered temperature for biome selection only, so borders do not run exactly along latitude.
  const jitterRng = rng.fork('biomeJitter');
  const biomeTemperature = classifyTemperatureJitter(jitterRng, temperature, w, h);
  const biomeMoisture = classifyMoistureJitter(jitterRng.fork('moisture'), moisture, w, h);
  const rawBiomes = computeBiomes(defs, rawHeight, biomeTemperature, biomeMoisture, arcana);
  onStage?.('shoreline');
  const shore = normalizeShoreline(rawHeight, rawBiomes, w, h, defs);
  const { height } = shore;
  // Lakes are part of the shores stage: the lake biome must be included in the surface bake.
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
  // Adjacency is part of the provinces stage (tens of ms).
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

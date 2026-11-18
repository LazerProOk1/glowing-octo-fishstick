import type { BiomeDef } from '../../content/biomes/types';

export const WORLD_W = 2048;
export const WORLD_H = 1024;
export const SEA_LEVEL = 0.5;
/** Heights above this are mountains (top ~3% of land). */
export const MOUNTAIN_LEVEL = 0.85;
/** Heights above this (and up to MOUNTAIN_LEVEL) are hills (~12% of land). */
export const HILL_LEVEL = 0.72;

export interface RiverPath {
  points: Array<{ x: number; y: number }>;
  /** Width per point, 1..4. */
  width: number[];
}

export interface Province {
  /** Equals the index in the provinces array and the value in `provinceOf`. */
  id: number;
  isLand: boolean;
  cellCount: number;
  /** A cell of the province near its centroid (integer cell coordinates). */
  center: { x: number; y: number };
  /** id of the most frequent biome among the province cells. */
  biome: string;
  /** Ids of 4-adjacent provinces (land and sea), ascending. */
  neighbors: number[];
  /** Land province bordering a sea province. */
  coastal: boolean;
}

export interface World {
  seed: string;
  w: number;
  h: number;
  height: Float32Array;
  temperature: Float32Array;
  moisture: Float32Array;
  /** «Магичность» 0..1 (см. computeArcana). */
  arcana: Float32Array;
  /** Включённые биомы этого мира; индекс — код биома. */
  biomes: BiomeDef[];
  /** Коды биомов: индекс в `biomes`. */
  biome: Uint8Array;
  riverMask: Uint8Array;
  rivers: RiverPath[];
  provinceOf: Uint16Array;
  provinces: Province[];
}

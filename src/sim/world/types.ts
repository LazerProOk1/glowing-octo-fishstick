export const WORLD_W = 2048;
export const WORLD_H = 1024;
export const SEA_LEVEL = 0.5;
/** Heights above this are mountains (top ~3% of land). */
export const MOUNTAIN_LEVEL = 0.85;
/** Heights above this (and up to MOUNTAIN_LEVEL) are hills (~12% of land). */
export const HILL_LEVEL = 0.72;

export type Biome =
  | 'ocean'
  | 'coast'
  | 'plains'
  | 'forest'
  | 'taiga'
  | 'tundra'
  | 'glacier'
  | 'desert'
  | 'steppe'
  | 'swamp'
  | 'hills'
  | 'mountains'
  | 'jungle';

/** Index in this array is the biome code stored in a Uint8Array. */
export const BIOMES: readonly Biome[] = [
  'ocean',
  'coast',
  'plains',
  'forest',
  'taiga',
  'tundra',
  'glacier',
  'desert',
  'steppe',
  'swamp',
  'hills',
  'mountains',
  'jungle',
];

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
  /** Most frequent biome among the province cells. */
  biome: Biome;
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
  /** Biome codes, index in BIOMES. */
  biome: Uint8Array;
  riverMask: Uint8Array;
  rivers: RiverPath[];
  provinceOf: Uint16Array;
  provinces: Province[];
}

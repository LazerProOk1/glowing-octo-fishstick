import type { BiomeDef } from '../../content/biomes/types';
import type { WorldParams } from './params';

export interface RiverPath {
  points: Array<{ x: number; y: number }>;
  /** Width per point, 1..4. */
  width: number[];
}

export interface Province {
  /** Equals the index in the provinces array and the value in `provinceOf`. */
  id: number;
  isLand: boolean;
  /** Province water: 'sea' — sea, 'lake' — lake (closed inland water body), null — land. */
  water: 'sea' | 'lake' | null;
  cellCount: number;
  /** A cell of the province near its centroid (integer cell coordinates). */
  center: { x: number; y: number };
  /** id of the most frequent biome among the province cells. */
  biome: string;
  /** Ids of 4-adjacent provinces (land and sea), ascending. */
  neighbors: number[];
  /**
   * Land province by the sea: borders a province with `water === 'sea'`. Basis for future ports
   * and fleets (fleets do not sail lakes); a lake shore does not count here.
   */
  coastal: boolean;
  /** Land province by a lake: borders a province with `water === 'lake'` (fresh water, fish). */
  lakeside: boolean;
}

/** Edge of the province adjacency graph. */
export interface ProvinceEdge {
  /** a < b — province ids. */
  a: number;
  b: number;
  /** Number of 4-adjacent cell pairs a|b on the shared border; 0 for a strait with no shared border. */
  length: number;
  /**
   * Land–land: number of border pairs along a major river (width ≥ 2) — pairs "river cell | other
   * bank"; 0 for other edges. Groundwork for crossing penalties proportional to length.
   */
  riverLength: number;
  /** Land–land border at least half of which runs along a major river: 2·riverLength ≥ length > 0. */
  river: boolean;
  /** Land provinces without a shared border, separated by water no wider than STRAIT_MAX_WATER cells. */
  strait: boolean;
}

export interface World {
  /** Everything that defines the world; the same params and version reproduce the same world. */
  params: WorldParams;
  w: number;
  h: number;
  height: Float32Array;
  temperature: Float32Array;
  moisture: Float32Array;
  /** "Arcana" 0..1 (see computeArcana). */
  arcana: Float32Array;
  /** Enabled biomes of this world; the index is the biome code. */
  biomes: BiomeDef[];
  /** Biome codes: index in `biomes`. */
  biome: Uint8Array;
  riverMask: Uint8Array;
  rivers: RiverPath[];
  provinceOf: Uint16Array;
  provinces: Province[];
  /** Adjacency edges in ascending (a, b) order; straits are in the same list. */
  adjacency: ProvinceEdge[];
  /** Indices of `adjacency` edges by province id, ascending. */
  edgesOf: number[][];
}

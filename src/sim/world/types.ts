import type { BiomeDef } from '../../content/biomes/types';
import type { WorldParams } from './params';

// Уровни рельефа живут в content (условия биомов в паках задаются через них); здесь — для sim и render.
export { HILL_LEVEL, MOUNTAIN_LEVEL, SEA_LEVEL } from '../../content/terrainLevels';

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

/** Ребро графа соседства провинций. */
export interface ProvinceEdge {
  /** a < b — id провинций. */
  a: number;
  b: number;
  /** Число пар 4-соседних клеток a|b на общей границе; 0 у пролива без общей границы. */
  length: number;
  /**
   * Суша–суша: число пар границы вдоль крупной реки (ширина ≥ 2) — пары «клетка реки | другой
   * берег»; 0 у прочих рёбер. Задел под штрафы за переправу пропорционально длине.
   */
  riverLength: number;
  /** Граница суша–суша, не меньше половины которой идёт по крупной реке: 2·riverLength ≥ length > 0. */
  river: boolean;
  /** Сухопутные провинции без общей границы, разделённые водой не шире STRAIT_MAX_WATER клеток. */
  strait: boolean;
}

export interface World {
  /** Всё, что задаёт мир; генерация по тем же параметрам и той же версии даёт тот же мир. */
  params: WorldParams;
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
  /** Рёбра соседства по возрастанию (a, b); проливы — в том же списке. */
  adjacency: ProvinceEdge[];
  /** Индексы рёбер `adjacency` по id провинции, по возрастанию. */
  edgesOf: number[][];
}

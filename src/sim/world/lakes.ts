// Озёра: замкнутые внутренние водоёмы, отдельный от моря тип воды.
import type { BiomeDef } from '../../content/biomes/types';
import { hasTag } from '../../content/registry';
import { SEA_LEVEL } from '../../content/terrainLevels';
import { labelComponents } from '../geom/label';

/** Внутренний водоём больше этого (в клетках) — море, а не озеро. */
export const LAKE_MAX_CELLS = 6000;

/**
 * Маска озёр: 1 — клетка озера. Озеро — 4-связная компонента воды (высота ≤ SEA_LEVEL), которая не
 * касается края карты и занимает не больше LAKE_MAX_CELLS клеток. Остальная вода — море.
 */
export function findLakes(height: Float32Array, w: number, h: number): Uint8Array {
  const n = w * h;
  const water = new Uint8Array(n);
  for (let i = 0; i < n; i++) water[i] = height[i]! <= SEA_LEVEL ? 1 : 0;
  const { comp, sizes } = labelComponents(water, w, h);
  const isLake = new Uint8Array(sizes.length);
  for (let i = 0; i < n; i++) if (water[i]) isLake[comp[i]!] = sizes[comp[i]!]! <= LAKE_MAX_CELLS ? 1 : 0;
  for (let x = 0; x < w; x++) {
    isLake[comp[x]!] = 0;
    isLake[comp[(h - 1) * w + x]!] = 0;
  }
  for (let y = 0; y < h; y++) {
    isLake[comp[y * w]!] = 0;
    isLake[comp[y * w + w - 1]!] = 0;
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = water[i]! & isLake[comp[i]!]!;
  return out;
}

/**
 * Биомы с озёрами: клетки маски `lake` получают биом с тегом `lake` (озёрный биом не выбирается по
 * условиям, его ставит только этот шаг). Возвращает новый массив.
 */
export function applyLakeBiome(biomes: Uint8Array, lake: Uint8Array, defs: readonly BiomeDef[]): Uint8Array {
  const code = defs.findIndex((d) => hasTag(d, 'lake'));
  if (code < 0) throw new Error('нет биома с тегом lake');
  const out = new Uint8Array(biomes);
  for (let i = 0; i < out.length; i++) if (lake[i]) out[i] = code;
  return out;
}

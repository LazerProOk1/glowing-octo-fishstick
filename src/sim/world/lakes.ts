// Lakes: closed inland water bodies, a water type separate from the sea.
import { CodedError } from './errors';
import type { BiomeDef } from '../../content/biomes/types';
import { hasTag } from '../../content/registry';
import { SEA_LEVEL } from '../../content/terrainLevels';
import { labelComponents } from '../geom/label';

/** An inland water body larger than this (in cells) is a sea, not a lake. */
export const LAKE_MAX_CELLS = 6000;

/**
 * Lake mask: 1 — lake cell. A lake is a 4-connected water component (height ≤ SEA_LEVEL) that does
 * not touch the map edge and occupies at most LAKE_MAX_CELLS cells. The rest of the water is sea.
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
 * Biomes with lakes: cells of the `lake` mask get the biome tagged `lake` (the lake biome is never
 * chosen by conditions, only this step sets it). Returns a new array.
 */
export function applyLakeBiome(biomes: Uint8Array, lake: Uint8Array, defs: readonly BiomeDef[]): Uint8Array {
  const code = defs.findIndex((d) => hasTag(d, 'lake'));
  if (code < 0) throw new CodedError('no_lake_biome');
  const out = new Uint8Array(biomes);
  for (let i = 0; i < out.length; i++) if (lake[i]) out[i] = code;
  return out;
}

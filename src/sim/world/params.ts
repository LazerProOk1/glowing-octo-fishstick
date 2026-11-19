// World description: everything that uniquely determines the generation result (spec §7.2).
import type { GenOptions } from '../../content/biomes/types';
import { DEFAULT_PACKS } from '../../content/registry';

/**
 * Generator version. RULE: bump by 1 on ANY generation change that alters the result for the same
 * WorldParams (world arrays, provinces, adjacency edges, World contents) — in the same commit,
 * together with updating the fingerprint in tests/sim/world/fingerprint.test.ts.
 * Pure optimisations with a bit-identical result do not change the version.
 * History: 1 — stages 1–12; 2 — WorldParams, world size, province adjacency graph;
 * 3 — lakes, sea-province density, jungle edge (stage 1.5).
 */
export const GEN_VERSION = 3;

export type WorldSize = 'small' | 'medium' | 'large';

export const WORLD_SIZES: readonly WorldSize[] = ['small', 'medium', 'large'];
export const DEFAULT_SIZE: WorldSize = 'medium';

/** Map dimensions in cells. Continents are defined in fractions of the map, so size is resolution. */
export const SIZE_PRESETS: Readonly<Record<WorldSize, { readonly w: number; readonly h: number }>> = {
  small: { w: 1024, h: 512 },
  medium: { w: 2048, h: 1024 },
  large: { w: 3072, h: 1536 },
};

/** Default map height (medium): the scale for values given in cells. */
export const MEDIUM_H = SIZE_PRESETS.medium.h;

export interface WorldParams {
  genVersion: number;
  seed: string;
  /** Packs in order. */
  packs: string[];
  options: {
    fantasy: boolean;
    /** No duplicates, alphabetical. */
    disabledBiomes: string[];
    size: WorldSize;
  };
}

export function isWorldSize(s: string): s is WorldSize {
  return (WORLD_SIZES as readonly string[]).includes(s);
}

/** Default params for a seed: current version, base pack, no fantasy, medium. */
export function defaultParams(seed: string): WorldParams {
  return {
    genVersion: GEN_VERSION,
    seed,
    packs: [...DEFAULT_PACKS],
    options: { fantasy: false, disabledBiomes: [], size: DEFAULT_SIZE },
  };
}

/** Options for assembling biomes from world params. */
export function genOptionsOf(params: WorldParams): GenOptions {
  return {
    packs: params.packs,
    fantasy: params.options.fantasy,
    disabledBiomes: params.options.disabledBiomes,
  };
}

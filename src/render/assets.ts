import type { Biome } from '../sim/world/types';

/** Terrain detail atlas: 4x4 grid of 512px grayscale tiles (luminance detail only). */
export const ATLAS_URL: string = new URL('../../assets/terrain/atlas.png', import.meta.url).href;
export const ATLAS_GRID = 4;

export const DetailSlot = {
  GRASS: 0,
  FOREST: 1,
  SAND: 2,
  ROCK: 3,
  SNOW: 4,
  MUD: 5,
  PAPER: 6,
} as const;
export type DetailSlot = (typeof DetailSlot)[keyof typeof DetailSlot];

/** Biome colour comes from the palette; this only picks the detail texture. */
export const TERRAIN_TEXTURES: Record<Biome, DetailSlot> = {
  ocean: DetailSlot.PAPER,
  coast: DetailSlot.PAPER,
  plains: DetailSlot.GRASS,
  steppe: DetailSlot.GRASS,
  forest: DetailSlot.FOREST,
  taiga: DetailSlot.FOREST,
  jungle: DetailSlot.FOREST,
  desert: DetailSlot.SAND,
  hills: DetailSlot.ROCK,
  mountains: DetailSlot.ROCK,
  tundra: DetailSlot.SNOW,
  glacier: DetailSlot.SNOW,
  swamp: DetailSlot.MUD,
};

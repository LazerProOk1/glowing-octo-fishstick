import type { DetailSlotName } from '../content/biomes/types';

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

/** Atlas slot by the name from the biome data (BiomeDef.detail). The biome colour comes from its data. */
export const DETAIL_SLOT_OF: Record<DetailSlotName, DetailSlot> = {
  grass: DetailSlot.GRASS,
  forest: DetailSlot.FOREST,
  sand: DetailSlot.SAND,
  rock: DetailSlot.ROCK,
  snow: DetailSlot.SNOW,
  mud: DetailSlot.MUD,
  paper: DetailSlot.PAPER,
};

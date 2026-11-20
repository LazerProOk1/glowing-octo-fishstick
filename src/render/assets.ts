import { DETAIL_SLOT_NAMES, type DetailSlotName } from '../content/biomes/types';

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

/** Atlas slot by the name from the biome data (BiomeDef.detail): index in DETAIL_SLOT_NAMES = slot. */
export const DETAIL_SLOT_OF = Object.fromEntries(DETAIL_SLOT_NAMES.map((n, k) => [n, k])) as Record<DetailSlotName, DetailSlot>;

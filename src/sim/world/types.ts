export const WORLD_W = 2048;
export const WORLD_H = 1024;
export const SEA_LEVEL = 0.5;

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

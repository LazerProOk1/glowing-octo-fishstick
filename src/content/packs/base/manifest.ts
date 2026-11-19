import type { PackManifest } from '../../biomes/types';
import { BASE_BIOMES, LAKE_BIOME } from './biomes';
import { FANTASY_BIOMES } from './fantasyBiomes';

/** Base pack: ordinary biomes, then fantasy (fantasy codes come after the ordinary ones), then the lake. */
export const BASE_PACK: PackManifest = {
  id: 'base',
  nameKey: 'pack.base',
  version: '1.0.0',
  biomes: [...BASE_BIOMES, ...FANTASY_BIOMES, LAKE_BIOME],
};

import type { PackManifest } from '../../biomes/types';
import { BASE_BIOMES, LAKE_BIOME } from './biomes';
import { FANTASY_BIOMES } from './fantasyBiomes';

/** Базовый пак: обычные биомы, затем фэнтези (коды фэнтези идут после обычных), затем озеро. */
export const BASE_PACK: PackManifest = {
  id: 'base',
  nameKey: 'pack.base',
  version: '1.0.0',
  biomes: [...BASE_BIOMES, ...FANTASY_BIOMES, LAKE_BIOME],
};

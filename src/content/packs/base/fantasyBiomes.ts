import type { BiomeDef } from '../../biomes/types';

// Fantasy biomes (enabled by the fantasy flag). Each one forms "patches" over the arcana field
// within a suitable climate: high arcana gives mushroom forest in warm humidity, ash
// wastes in dry heat and crystal mountains on peaks; low arcana gives magic forest
// in a cool humid band. Priorities are above climate biomes but below hills and mountains
// (except crystal mountains, which take peaks from the ordinary ones).

export const FANTASY_BIOMES: BiomeDef[] = [
  {
    id: 'mushroom_forest',
    nameKey: 'biome.mushroom_forest',
    kind: 'land',
    fantasy: true,
    color: [128, 106, 118],
    detail: 'forest',
    priority: 75,
    when: { temperature: [6, 24], moisture: [0.55, Infinity], arcana: [0.79, Infinity] },
  },
  {
    id: 'magic_forest',
    nameKey: 'biome.magic_forest',
    kind: 'land',
    fantasy: true,
    color: [84, 118, 110],
    detail: 'forest',
    priority: 74,
    when: { temperature: [-6, 14], moisture: [0.4, Infinity], arcana: [-Infinity, 0.19] },
  },
  {
    id: 'ash_wastes',
    nameKey: 'biome.ash_wastes',
    kind: 'land',
    fantasy: true,
    color: [124, 116, 108],
    detail: 'mud',
    priority: 73,
    when: { temperature: [16, Infinity], moisture: [-Infinity, 0.28], arcana: [0.83, Infinity] },
  },
  {
    id: 'crystal_mountains',
    nameKey: 'biome.crystal_mountains',
    kind: 'land',
    fantasy: true,
    color: [152, 152, 170],
    detail: 'rock',
    priority: 97,
    when: { height: [0.8, Infinity], arcana: [0.7, Infinity] },
    tags: ['mountain'],
  },
];

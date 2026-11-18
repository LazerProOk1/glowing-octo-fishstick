import type { BiomeDef } from '../../biomes/types';

// Фэнтези-биомы (включаются флагом fantasy). Каждый — «пятна» по полю arcana внутри
// подходящего климата: высокая магичность даёт грибной лес во влажном тепле, пепельные
// пустоши в сухой жаре и кристальные горы на вершинах; низкая — магический лес в прохладной
// влажной полосе. Приоритеты выше климатических биомов, но ниже холмов и гор (кроме
// кристальных гор, которые забирают вершины у обычных).

export const FANTASY_BIOMES: BiomeDef[] = [
  {
    id: 'mushroom_forest',
    name: 'грибной лес',
    kind: 'land',
    fantasy: true,
    color: [128, 106, 118],
    detail: 'forest',
    priority: 75,
    when: { temperature: [6, 24], moisture: [0.55, Infinity], arcana: [0.79, Infinity] },
  },
  {
    id: 'magic_forest',
    name: 'магический лес',
    kind: 'land',
    fantasy: true,
    color: [84, 118, 110],
    detail: 'forest',
    priority: 74,
    when: { temperature: [-6, 14], moisture: [0.4, Infinity], arcana: [-Infinity, 0.19] },
  },
  {
    id: 'ash_wastes',
    name: 'пепельные пустоши',
    kind: 'land',
    fantasy: true,
    color: [124, 116, 108],
    detail: 'mud',
    priority: 73,
    when: { temperature: [16, Infinity], moisture: [-Infinity, 0.28], arcana: [0.83, Infinity] },
  },
  {
    id: 'crystal_mountains',
    name: 'кристальные горы',
    kind: 'land',
    fantasy: true,
    color: [152, 152, 170],
    detail: 'rock',
    priority: 97,
    when: { height: [0.8, Infinity], arcana: [0.7, Infinity] },
    tags: ['mountain'],
  },
];

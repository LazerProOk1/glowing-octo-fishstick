import type { Biome } from '../types/world';

export type Rgb = readonly [number, number, number];

export const BIOME_HEX: Record<Biome, string> = {
  ocean: '#4A90B8',
  coast: '#C2B280',
  plains: '#8FBC6B',
  forest: '#4A7C3F',
  mountains: '#8B8680',
  desert: '#D4B87A',
  tundra: '#C8D8E0',
  swamp: '#6B7F5A',
  volcanic: '#5C4033',
};

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export const BIOME_RGB: Record<Biome, Rgb> = {
  ocean: hexToRgb(BIOME_HEX.ocean),
  coast: hexToRgb(BIOME_HEX.coast),
  plains: hexToRgb(BIOME_HEX.plains),
  forest: hexToRgb(BIOME_HEX.forest),
  mountains: hexToRgb(BIOME_HEX.mountains),
  desert: hexToRgb(BIOME_HEX.desert),
  tundra: hexToRgb(BIOME_HEX.tundra),
  swamp: hexToRgb(BIOME_HEX.swamp),
  volcanic: hexToRgb(BIOME_HEX.volcanic),
};

import type { Surface } from '@/types/world';

export type Rgb = readonly [number, number, number];

/**
 * Muted cartographic palette. `plains` is the grass base tinted by texture,
 * `hills` and `mountains` are desaturated so hillshading reads as relief.
 */
export const SURFACE_HEX: Record<Surface, string> = {
  deepOcean: '#1B4965',
  shallowWater: '#62B6CB',
  beach: '#E8D8B0',
  plains: '#76A035',
  tundra: '#A9B3A2',
  forest: '#386641',
  taiga: '#2A4836',
  hills: '#8F9A6C',
  mountains: '#6C757D',
  snow: '#F8F9FA',
  desert: '#DCC79B',
  swamp: '#5F7A5C',
  volcanic: '#635B55',
};

export interface HighlandBand {
  readonly from: number;
  readonly color: Rgb;
}

/**
 * Hypsometric tints for land above 50: discrete elevation steps, so hills,
 * bare rock and snow read as cartographic bands instead of a smooth blur.
 */
export const HIGHLAND_BANDS: readonly HighlandBand[] = [
  { from: 50, color: [0x8f, 0x9a, 0x6c] },
  { from: 60, color: [0x7e, 0x87, 0x77] },
  { from: 70, color: [0x6c, 0x75, 0x7d] },
  { from: 82, color: [0x66, 0x6f, 0x77] },
  { from: 90, color: [0x8b, 0x94, 0x9a] },
  { from: 93, color: [0xad, 0xb6, 0xbb] },
  { from: 96, color: [0xf8, 0xf9, 0xfa] },
];

export function highlandColor(elevation: number): Rgb {
  let color: Rgb = HIGHLAND_BANDS[0]?.color ?? SURFACE_RGB.hills;
  for (const band of HIGHLAND_BANDS) {
    if (elevation >= band.from) {
      color = band.color;
    }
  }
  return color;
}

/** Warm paper tint that unifies the terrain the way a printed map does */
export const PAPER_HEX = '#EFEEE7';
export const RIVER_HEX = '#5FA8D3';
export const FOAM_HEX = '#93CFE0';

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export const SURFACE_RGB: Record<Surface, Rgb> = {
  deepOcean: hexToRgb(SURFACE_HEX.deepOcean),
  shallowWater: hexToRgb(SURFACE_HEX.shallowWater),
  beach: hexToRgb(SURFACE_HEX.beach),
  plains: hexToRgb(SURFACE_HEX.plains),
  tundra: hexToRgb(SURFACE_HEX.tundra),
  forest: hexToRgb(SURFACE_HEX.forest),
  taiga: hexToRgb(SURFACE_HEX.taiga),
  hills: hexToRgb(SURFACE_HEX.hills),
  mountains: hexToRgb(SURFACE_HEX.mountains),
  snow: hexToRgb(SURFACE_HEX.snow),
  desert: hexToRgb(SURFACE_HEX.desert),
  swamp: hexToRgb(SURFACE_HEX.swamp),
  volcanic: hexToRgb(SURFACE_HEX.volcanic),
};

export const RIVER_RGB = hexToRgb(RIVER_HEX);
export const FOAM_RGB = hexToRgb(FOAM_HEX);
export const PAPER_RGB = hexToRgb(PAPER_HEX);

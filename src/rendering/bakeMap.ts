import { clamp, lerp } from '@/lib/math';
import {
  DEFAULT_HILLSHADE,
  createHillshadeField,
  sampleField,
  upsampleField,
} from '@/simulation/hillshade';
import { SEA_LEVEL } from '@/simulation/mapGenerator';
import type { Surface, World } from '@/types/world';
import { FOAM_RGB, PAPER_RGB, SURFACE_RGB, highlandColor, type Rgb } from './palette';

/**
 * Baked pixels per tile. The layer is drawn 1:1 at the fit zoom, so a higher
 * value means a sharper map; biome fills are flat, therefore no dithering or
 * per-pixel texture is added anywhere.
 */
export const PIXELS_PER_TILE = 10;
const MIN_PIXELS_PER_TILE = 4;
const MAX_PIXELS_PER_TILE = 16;

const LAND_PAPER_MIX = 0.06;
const WATER_PAPER_MIX = 0.03;

const FOAM_DEPTH = 0.8;
const FOAM_MIX = 0.42;

const SHORE_DEPTH = 0.9;
const SHORE_DARKEN = 0.86;

const CONTOUR_STEP = 5;
const CONTOUR_WIDTH = 0.22;
const CONTOUR_DARKEN = 0.93;
const INDEX_CONTOUR_EVERY = 5;
const INDEX_CONTOUR_DARKEN = 0.87;

const SAND_LIMIT = SEA_LEVEL + 3;
const SNOW_LINE = 94;
const COLD_SNOW_LINE = 86;
const ROCK_LINE = 70;
const HILL_LINE = 50;

export interface BakedMap {
  readonly width: number;
  readonly height: number;
  /** RGBA, row-major */
  readonly pixels: Uint8ClampedArray;
}

export interface BakeOptions {
  /** Baked pixels per tile; defaults to PIXELS_PER_TILE */
  readonly pixelsPerTile?: number;
}

/**
 * Surface of a single pixel. Elevation, moisture and temperature are already
 * interpolated between tiles, so thresholds draw smooth curves instead of
 * following the tile grid.
 */
export function surfaceAt(elevation: number, moisture: number, temperature: number): Surface {
  if (elevation < SEA_LEVEL - 10) {
    return 'deepOcean';
  }
  if (elevation < SEA_LEVEL) {
    return 'shallowWater';
  }
  if (elevation < SAND_LIMIT) {
    return 'beach';
  }
  if (elevation >= SNOW_LINE || (elevation >= COLD_SNOW_LINE && temperature < -2)) {
    return 'snow';
  }
  if (elevation >= ROCK_LINE) {
    return 'mountains';
  }
  if (elevation >= HILL_LINE) {
    return 'hills';
  }
  if (moisture >= 70 && elevation < SEA_LEVEL + 11 && temperature >= 5) {
    return 'swamp';
  }
  if (temperature < 0) {
    return 'tundra';
  }
  if (moisture > 60) {
    return temperature < 3 ? 'taiga' : 'forest';
  }
  if (moisture < 25) {
    return 'desert';
  }
  return 'plains';
}

function paperMixed(color: Rgb, mix: number): Rgb {
  return [
    lerp(color[0], PAPER_RGB[0], mix),
    lerp(color[1], PAPER_RGB[1], mix),
    lerp(color[2], PAPER_RGB[2], mix),
  ];
}

/**
 * Flat political-map bake: solid biome fills, a soft bathymetry gradient and
 * hillshading for relief. No noise, no dithering, no pixel texture — the only
 * variation comes from the interpolated climate fields and the light.
 */
export function bakeMap(world: World, options: BakeOptions = {}): BakedMap {
  const scale = clamp(
    Math.round(options.pixelsPerTile ?? PIXELS_PER_TILE),
    MIN_PIXELS_PER_TILE,
    MAX_PIXELS_PER_TILE,
  );
  const width = world.width * scale;
  const height = world.height * scale;
  const pixels = new Uint8ClampedArray(width * height * 4);

  // Every field is lifted to pixel resolution once, with smoothstep weights, so
  // the same pixel can be classified from continuous values.
  const heights = upsampleField(world.elevationMap, world.width, world.height, scale, true);
  const moisture = upsampleField(world.moistureMap, world.width, world.height, scale, true);
  const temperature = upsampleField(world.temperatureMap, world.width, world.height, scale, true);

  const shadeField = createHillshadeField(world.reliefMap, world.width, world.height, DEFAULT_HILLSHADE);

  const deep = SURFACE_RGB.deepOcean;
  const shallow = SURFACE_RGB.shallowWater;
  const half = 0.5 / scale;

  for (let y = 0; y < height; y += 1) {
    const sampleY = (y + 0.5) / scale - 0.5;

    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;

      const elevation = heights.data[index] ?? 0;
      const moistureValue = moisture.data[index] ?? 0;
      const temperatureValue = temperature.data[index] ?? 0;

      let red: number;
      let green: number;
      let blue: number;
      let factor = 1;

      if (elevation < SEA_LEVEL) {
        // Bathymetry: dark open water fading into the light shelf.
        const rawDepth = clamp(elevation / SEA_LEVEL, 0, 1);
        const depth = rawDepth * rawDepth * (3 - 2 * rawDepth);
        red = lerp(lerp(deep[0], shallow[0], depth), PAPER_RGB[0], WATER_PAPER_MIX);
        green = lerp(lerp(deep[1], shallow[1], depth), PAPER_RGB[1], WATER_PAPER_MIX);
        blue = lerp(lerp(deep[2], shallow[2], depth), PAPER_RGB[2], WATER_PAPER_MIX);

        if (elevation > SEA_LEVEL - FOAM_DEPTH) {
          red = lerp(red, FOAM_RGB[0], FOAM_MIX);
          green = lerp(green, FOAM_RGB[1], FOAM_MIX);
          blue = lerp(blue, FOAM_RGB[2], FOAM_MIX);
        }
      } else {
        const surface = surfaceAt(elevation, moistureValue, temperatureValue);
        const base = paperMixed(
          surface === 'hills' || surface === 'mountains' || surface === 'snow'
            ? highlandColor(elevation)
            : SURFACE_RGB[surface],
          LAND_PAPER_MIX,
        );

        red = base[0];
        green = base[1];
        blue = base[2];

        // Relief volume comes from the hillshade only.
        factor = sampleField(
          shadeField,
          world.width,
          world.height,
          (x + 0.5) / scale - 0.5 + half,
          sampleY,
        );

        if (elevation > SEA_LEVEL + 3) {
          const stepIndex = Math.floor(elevation / CONTOUR_STEP);
          const phase = elevation - stepIndex * CONTOUR_STEP;
          if (phase < CONTOUR_WIDTH) {
            factor *= stepIndex % INDEX_CONTOUR_EVERY === 0 ? INDEX_CONTOUR_DARKEN : CONTOUR_DARKEN;
          }
        }

        if (elevation < SEA_LEVEL + SHORE_DEPTH) {
          factor *= SHORE_DARKEN;
        }
      }

      const offset = index * 4;
      pixels[offset] = clamp(red * factor, 0, 255);
      pixels[offset + 1] = clamp(green * factor, 0, 255);
      pixels[offset + 2] = clamp(blue * factor, 0, 255);
      pixels[offset + 3] = 255;
    }
  }

  return { width, height, pixels };
}

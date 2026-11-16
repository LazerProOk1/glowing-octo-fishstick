import { clamp, lerp } from '@/lib/math';
import {
  DEFAULT_HILLSHADE,
  createHillshadeField,
  sampleField,
  upsampleField,
} from '@/simulation/hillshade';
import { SEA_LEVEL } from '@/simulation/mapGenerator';
import { hash2D } from '@/simulation/noise';
import type { Surface, World } from '@/types/world';
import { FOAM_RGB, PAPER_RGB, SURFACE_RGB, highlandColor, type Rgb } from './palette';

/** Baked pixels per tile: the resolution of the terrain layer, not its granularity */
export const PIXELS_PER_TILE = 4;

const FINE_TEXTURE = 0.035;
const COARSE_TEXTURE = 0.02;
const WATER_TEXTURE = 0.015;

const LAND_PAPER_MIX = 0.06;
const WATER_PAPER_MIX = 0.03;

const FOAM_DEPTH = 0.8;
const FOAM_MIX = 0.42;

const SHORE_DEPTH = 0.9;
const SHORE_DARKEN = 0.84;

const CONTOUR_STEP = 5;
const CONTOUR_WIDTH = 0.32;
const CONTOUR_DARKEN = 0.87;
const INDEX_CONTOUR_EVERY = 5;
const INDEX_CONTOUR_DARKEN = 0.8;

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

export function bakeMap(world: World): BakedMap {
  const width = world.width * PIXELS_PER_TILE;
  const height = world.height * PIXELS_PER_TILE;
  const pixels = new Uint8ClampedArray(width * height * 4);

  // Every field is lifted to pixel resolution once, with smoothstep weights, so
  // the same pixel can be classified from continuous values.
  const heights = upsampleField(world.elevationMap, world.width, world.height, PIXELS_PER_TILE, true);
  const moisture = upsampleField(world.moistureMap, world.width, world.height, PIXELS_PER_TILE, true);
  const temperature = upsampleField(
    world.temperatureMap,
    world.width,
    world.height,
    PIXELS_PER_TILE,
    true,
  );

  const shadeField = createHillshadeField(world.reliefMap, world.width, world.height, DEFAULT_HILLSHADE);
  const textureSeed = world.seed * 31 + 977;

  // One coarse grain value per tile instead of per pixel keeps baking cheap.
  const tileGrain = new Float32Array(world.width * world.height);
  for (let tileY = 0; tileY < world.height; tileY += 1) {
    for (let tileX = 0; tileX < world.width; tileX += 1) {
      tileGrain[tileY * world.width + tileX] = (hash2D(tileX, tileY, textureSeed + 131) - 0.5) * 2;
    }
  }

  const deep = SURFACE_RGB.deepOcean;
  const shallow = SURFACE_RGB.shallowWater;

  for (let y = 0; y < height; y += 1) {
    const tileY = Math.floor(y / PIXELS_PER_TILE);
    const sampleY = (y + 0.5) / PIXELS_PER_TILE - 0.5;

    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const tileX = Math.floor(x / PIXELS_PER_TILE);

      const elevation = heights.data[index] ?? 0;
      const moistureValue = moisture.data[index] ?? 0;
      const temperatureValue = temperature.data[index] ?? 0;

      const fineNoise = (hash2D(x, y, textureSeed) - 0.5) * 2;
      const coarseNoise = tileGrain[tileY * world.width + tileX] ?? 0;

      let red: number;
      let green: number;
      let blue: number;
      let factor: number;

      if (elevation < SEA_LEVEL) {
        // Bathymetry: dark open water fading into the light shelf.
        const rawDepth = clamp(elevation / SEA_LEVEL, 0, 1);
        const depth = rawDepth * rawDepth * (3 - 2 * rawDepth);
        red = lerp(lerp(deep[0], shallow[0], depth), PAPER_RGB[0], WATER_PAPER_MIX);
        green = lerp(lerp(deep[1], shallow[1], depth), PAPER_RGB[1], WATER_PAPER_MIX);
        blue = lerp(lerp(deep[2], shallow[2], depth), PAPER_RGB[2], WATER_PAPER_MIX);
        factor = 1 + fineNoise * WATER_TEXTURE + coarseNoise * WATER_TEXTURE * 0.6;

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

        factor = 1 + fineNoise * FINE_TEXTURE + coarseNoise * COARSE_TEXTURE;
        factor *= sampleField(
          shadeField,
          world.width,
          world.height,
          (x + 0.5) / PIXELS_PER_TILE - 0.5,
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

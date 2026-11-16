import { clamp, lerp } from '@/lib/math';
import {
  DEFAULT_HILLSHADE,
  createHillshadeField,
  sampleField,
  upsampleField,
} from '@/simulation/hillshade';
import { SEA_LEVEL } from '@/simulation/mapGenerator';
import { hash2D } from '@/simulation/noise';
import { isWaterSurface, type Surface, type World } from '@/types/world';
import { FOAM_RGB, PAPER_RGB, RIVER_RGB, SURFACE_RGB, highlandColor, type Rgb } from './palette';

/** Baked pixels per tile: the grid stays crisp, details get room to breathe */
export const PIXELS_PER_TILE = 4;

const FINE_TEXTURE = 0.035;
const COARSE_TEXTURE = 0.02;
const WATER_TEXTURE = 0.015;

const LAND_PAPER_MIX = 0.12;
const WATER_PAPER_MIX = 0.03;
/** 0 = flat tile colours, 1 = fully bilinear between tiles */
const TILE_COLOR_BLEND = 0.45;

const FOAM_DEPTH = 0.8;
const FOAM_MIX = 0.42;

const SHORE_DEPTH = 0.9;
const SHORE_DARKEN = 0.84;

const CONTOUR_STEP = 5;
const CONTOUR_WIDTH = 0.32;
const CONTOUR_DARKEN = 0.87;
const INDEX_CONTOUR_EVERY = 5;
const INDEX_CONTOUR_DARKEN = 0.8;

const HIGHLAND_START = 50;

const RIVER_WIDTH = 1;
const RIVER_MOUTH_WIDTH = 2;
const RIVER_WIDTH_THRESHOLD = 60;
const RIVER_BEND = 1.4;
const PIXEL_CENTER = PIXELS_PER_TILE / 2;

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

export interface BakedMap {
  readonly width: number;
  readonly height: number;
  /** RGBA, row-major */
  readonly pixels: Uint8ClampedArray;
}

function writePixel(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  color: Rgb,
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }
  const offset = (y * width + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = 255;
}

function paintBlock(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  color: Rgb,
  thickness: number,
): void {
  for (let dy = 0; dy < thickness; dy += 1) {
    for (let dx = 0; dx < thickness; dx += 1) {
      writePixel(pixels, width, height, x + dx, y + dy, color);
    }
  }
}

function drawLine(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: Rgb,
  thickness: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));

  if (steps === 0) {
    paintBlock(pixels, width, height, x0, y0, color, thickness);
    return;
  }

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    paintBlock(pixels, width, height, Math.round(x0 + dx * t), Math.round(y0 + dy * t), color, thickness);
  }
}

function nearestLandSurface(world: World, tileX: number, tileY: number): Surface {
  for (const offset of NEIGHBOR_OFFSETS) {
    const tile = world.tiles[tileY + offset[1]]?.[tileX + offset[0]];
    if (tile !== undefined && !isWaterSurface(tile.surface)) {
      return tile.surface;
    }
  }
  return 'plains';
}

/** Colour of a tile in the baked palette, before shading and texture. */
function tileBaseColor(world: World, tileX: number, tileY: number): Rgb {
  const tile = world.tiles[tileY]?.[tileX];
  if (tile === undefined) {
    return SURFACE_RGB.plains;
  }
  const surface = isWaterSurface(tile.surface) ? nearestLandSurface(world, tileX, tileY) : tile.surface;
  const base =
    tile.elevation > HIGHLAND_START && (surface === 'hills' || surface === 'mountains' || surface === 'snow')
      ? highlandColor(tile.elevation)
      : SURFACE_RGB[surface];

  return [
    lerp(base[0], PAPER_RGB[0], LAND_PAPER_MIX),
    lerp(base[1], PAPER_RGB[1], LAND_PAPER_MIX),
    lerp(base[2], PAPER_RGB[2], LAND_PAPER_MIX),
  ];
}

export function bakeMap(world: World): BakedMap {
  const width = world.width * PIXELS_PER_TILE;
  const height = world.height * PIXELS_PER_TILE;
  const pixels = new Uint8ClampedArray(width * height * 4);

  // Heights are interpolated per pixel, so coastlines, bathymetry and relief
  // follow smooth curves instead of 4 px staircases.
  const heights = upsampleField(world.elevationMap, world.width, world.height, PIXELS_PER_TILE);
  const shadeField = createHillshadeField(world.reliefMap, world.width, world.height, DEFAULT_HILLSHADE);
  const textureSeed = world.seed * 31 + 977;

  // Land colours per tile; water tiles borrow the nearest land colour so the
  // bilinear sampler never drags dark water pixels into the beach.
  const tileColors = new Float32Array(world.width * world.height * 3);
  for (let tileY = 0; tileY < world.height; tileY += 1) {
    for (let tileX = 0; tileX < world.width; tileX += 1) {
      const color = tileBaseColor(world, tileX, tileY);
      const offset = (tileY * world.width + tileX) * 3;
      tileColors[offset] = color[0];
      tileColors[offset + 1] = color[1];
      tileColors[offset + 2] = color[2];
    }
  }

  const tileWidth = world.width;
  const tileHeight = world.height;
  const deep = SURFACE_RGB.deepOcean;
  const shallow = SURFACE_RGB.shallowWater;

  // One coarse grain value per tile instead of per pixel keeps baking cheap.
  const tileGrain = new Float32Array(tileWidth * tileHeight);
  for (let tileY = 0; tileY < tileHeight; tileY += 1) {
    for (let tileX = 0; tileX < tileWidth; tileX += 1) {
      tileGrain[tileY * tileWidth + tileX] = (hash2D(tileX, tileY, textureSeed + 131) - 0.5) * 2;
    }
  }

  for (let y = 0; y < height; y += 1) {
    const tileY = Math.floor(y / PIXELS_PER_TILE);
    const sampleY = (y + 0.5) / PIXELS_PER_TILE - 0.5;
    const clampedY = clamp(sampleY, 0, tileHeight - 1);
    const row0 = Math.floor(clampedY);
    const row1 = Math.min(tileHeight - 1, row0 + 1);
    const ty = clampedY - row0;

    for (let x = 0; x < width; x += 1) {
      const elevation = heights.data[y * width + x] ?? 0;
      const fineNoise = (hash2D(x, y, textureSeed) - 0.5) * 2;
      const tileX = Math.floor(x / PIXELS_PER_TILE);
      const coarseNoise = tileGrain[tileY * tileWidth + tileX] ?? 0;

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
        const sampleX = (x + 0.5) / PIXELS_PER_TILE - 0.5;
        const clampedX = clamp(sampleX, 0, tileWidth - 1);
        const column0 = Math.floor(clampedX);
        const column1 = Math.min(tileWidth - 1, column0 + 1);
        const tx = clampedX - column0;

        const topLeft = (row0 * tileWidth + column0) * 3;
        const topRight = (row0 * tileWidth + column1) * 3;
        const bottomLeft = (row1 * tileWidth + column0) * 3;
        const bottomRight = (row1 * tileWidth + column1) * 3;

        const blendRed = lerp(
          lerp(tileColors[topLeft] ?? 0, tileColors[topRight] ?? 0, tx),
          lerp(tileColors[bottomLeft] ?? 0, tileColors[bottomRight] ?? 0, tx),
          ty,
        );
        const blendGreen = lerp(
          lerp(tileColors[topLeft + 1] ?? 0, tileColors[topRight + 1] ?? 0, tx),
          lerp(tileColors[bottomLeft + 1] ?? 0, tileColors[bottomRight + 1] ?? 0, tx),
          ty,
        );
        const blendBlue = lerp(
          lerp(tileColors[topLeft + 2] ?? 0, tileColors[topRight + 2] ?? 0, tx),
          lerp(tileColors[bottomLeft + 2] ?? 0, tileColors[bottomRight + 2] ?? 0, tx),
          ty,
        );

        const nearest = (Math.round(clampedY) * tileWidth + Math.round(clampedX)) * 3;
        red = lerp(tileColors[nearest] ?? 0, blendRed, TILE_COLOR_BLEND);
        green = lerp(tileColors[nearest + 1] ?? 0, blendGreen, TILE_COLOR_BLEND);
        blue = lerp(tileColors[nearest + 2] ?? 0, blendBlue, TILE_COLOR_BLEND);

        factor = 1 + fineNoise * FINE_TEXTURE + coarseNoise * COARSE_TEXTURE;
        factor *= sampleField(shadeField, tileWidth, tileHeight, clampedX, clampedY);

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

      const offset = (y * width + x) * 4;
      pixels[offset] = clamp(red * factor, 0, 255);
      pixels[offset + 1] = clamp(green * factor, 0, 255);
      pixels[offset + 2] = clamp(blue * factor, 0, 255);
      pixels[offset + 3] = 255;
    }
  }

  // Rivers follow the D8 flow network, so they run down valleys and merge into
  // a dendritic system instead of a handful of straight lines.
  for (let tileY = 0; tileY < tileHeight; tileY += 1) {
    const row = world.tiles[tileY];
    if (row === undefined) {
      continue;
    }
    for (let tileX = 0; tileX < tileWidth; tileX += 1) {
      const tile = row[tileX];
      if (tile === undefined || !tile.river) {
        continue;
      }
      const index = tileY * tileWidth + tileX;
      const downstream = world.flowDownstream[index] ?? -1;
      if (downstream < 0) {
        continue;
      }
      const nextX = downstream % tileWidth;
      const nextY = Math.floor(downstream / tileWidth);

      const startX = tileX * PIXELS_PER_TILE + PIXEL_CENTER;
      const startY = tileY * PIXELS_PER_TILE + PIXEL_CENTER;
      const endX = nextX * PIXELS_PER_TILE + PIXEL_CENTER;
      const endY = nextY * PIXELS_PER_TILE + PIXEL_CENTER;

      // A sub pixel bend per segment breaks D8 straight runs into a channel.
      const directionX = endX - startX;
      const directionY = endY - startY;
      const length = Math.hypot(directionX, directionY) || 1;
      const bend = (hash2D(tileX, tileY, world.seed + 997) - 0.5) * RIVER_BEND;
      const controlX = Math.round((startX + endX) / 2 - (directionY / length) * bend);
      const controlY = Math.round((startY + endY) / 2 + (directionX / length) * bend);

      const accumulation = world.flowAccumulation[index] ?? 0;
      const thickness = accumulation >= RIVER_WIDTH_THRESHOLD ? RIVER_MOUTH_WIDTH : RIVER_WIDTH;

      drawLine(pixels, width, height, startX, startY, controlX, controlY, RIVER_RGB, thickness);
      drawLine(pixels, width, height, controlX, controlY, endX, endY, RIVER_RGB, thickness);
    }
  }

  return { width, height, pixels };
}

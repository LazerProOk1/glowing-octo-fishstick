import { clamp, smoothstep } from '@/lib/math';
import type { Biome, ResourceType, Surface, Tile, World } from '@/types/world';
import { computeHydrology } from './hydrology';
import { generateProvinces } from './provinces';
import { createNoise2D, fbm2D, hash2D, ridgedFbm2D, type FbmConfig } from './noise';

export const DEFAULT_WORLD_WIDTH = 150;
export const DEFAULT_WORLD_HEIGHT = 100;

/** Elevation at which land ends and the sea shelf begins */
export const SEA_LEVEL = 24;

const WARP_AMPLITUDE = 24;

const WARP_FBM: FbmConfig = { octaves: 3, frequency: 0.0065, lacunarity: 2, gain: 0.55 };
const CONTINENT_FBM: FbmConfig = { octaves: 5, frequency: 0.0105, lacunarity: 2.05, gain: 0.5 };
const MOUNTAIN_FBM: FbmConfig = { octaves: 4, frequency: 0.022, lacunarity: 2.2, gain: 0.42 };
const MOISTURE_FBM: FbmConfig = { octaves: 3, frequency: 0.022, lacunarity: 2, gain: 0.5 };
const DETAIL_FBM: FbmConfig = { octaves: 2, frequency: 0.08, lacunarity: 2, gain: 0.5 };
const MESO_FBM: FbmConfig = { octaves: 2, frequency: 0.055, lacunarity: 2, gain: 0.5 };
const MICRO_FBM: FbmConfig = { octaves: 2, frequency: 0.3, lacunarity: 2, gain: 0.55 };
const MESO_RELIEF = 2.4;
const MICRO_RELIEF = 1;

const RIDGE_WEIGHT = 1.6;
const CONTINENT_WEIGHT = 0.6;

const VOLCANIC_MIN_ELEVATION = 88;
const VOLCANIC_PEAK_THRESHOLD = 0.94;

const RIVER_MEANDER = 0.8;
const RIVER_THRESHOLD = 45;

const PROVINCE_TARGET_COUNT = 88;
const PROVINCE_SEED_SPACING = 6;
const PROVINCE_MAX_COST = 26;

interface QuantileStop {
  /** Share of tiles at or below this value, 0..1 */
  readonly at: number;
  /** Output value at this quantile, 0..100 */
  readonly value: number;
}

/**
 * Elevation distribution: 40% sea, thin beach band, wide plains, then narrow
 * hill and mountain belts fed by the ridged noise.
 */
const ELEVATION_STOPS: readonly QuantileStop[] = [
  { at: 0, value: 0 },
  { at: 0.3, value: 12 },
  { at: 0.38, value: 22 },
  { at: 0.4, value: 24 },
  { at: 0.425, value: 27 },
  { at: 0.62, value: 40 },
  { at: 0.86, value: 50 },
  { at: 0.95, value: 70 },
  { at: 0.985, value: 82 },
  { at: 1, value: 100 },
];

const MOISTURE_STOPS: readonly QuantileStop[] = [
  { at: 0, value: 0 },
  { at: 0.18, value: 25 },
  { at: 0.55, value: 50 },
  { at: 0.7, value: 62 },
  { at: 1, value: 100 },
];

const FERTILITY_BASE: Record<Biome, number> = {
  ocean: 0,
  coast: 45,
  plains: 70,
  forest: 85,
  mountains: 12,
  desert: 12,
  tundra: 8,
  swamp: 55,
  volcanic: 4,
};

interface ResourceRule {
  readonly resource: ResourceType;
  readonly chance: number;
}

const RESOURCE_RULES: Record<Biome, readonly ResourceRule[]> = {
  ocean: [{ resource: 'fish', chance: 0.06 }],
  coast: [{ resource: 'fish', chance: 0.22 }],
  plains: [{ resource: 'grain', chance: 0.18 }],
  forest: [{ resource: 'wood', chance: 0.3 }],
  mountains: [
    { resource: 'stone', chance: 0.2 },
    { resource: 'iron', chance: 0.1 },
  ],
  desert: [{ resource: 'stone', chance: 0.03 }],
  tundra: [{ resource: 'stone', chance: 0.02 }],
  swamp: [{ resource: 'wood', chance: 0.12 }],
  volcanic: [
    { resource: 'gold', chance: 0.08 },
    { resource: 'stone', chance: 0.18 },
  ],
};

export interface BiomeInput {
  readonly elevation: number;
  readonly moisture: number;
  readonly temperature: number;
  /** 0..1, higher means a sharper and rarer peak */
  readonly peak: number;
}

function interpolateStops(stops: readonly QuantileStop[], quantile: number): number {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (first === undefined || last === undefined) {
    return 0;
  }
  if (quantile <= first.at) {
    return first.value;
  }
  if (quantile >= last.at) {
    return last.value;
  }
  for (let i = 1; i < stops.length; i += 1) {
    const previous = stops[i - 1];
    const next = stops[i];
    if (previous === undefined || next === undefined || quantile > next.at) {
      continue;
    }
    const span = next.at - previous.at || 1;
    return previous.value + ((quantile - previous.at) / span) * (next.value - previous.value);
  }
  return last.value;
}

/** Maps a raw noise field onto a target distribution using its own quantiles. */
function applyQuantiles(field: Float32Array, stops: readonly QuantileStop[]): Float32Array {
  const sorted = Float32Array.from(field).sort();
  const size = sorted.length;
  const span = size > 1 ? size - 1 : 1;
  const result = new Float32Array(size);

  for (let i = 0; i < size; i += 1) {
    const value = field[i] ?? 0;

    let low = 0;
    let high = size - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((sorted[middle] ?? 0) < value) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    result[i] = interpolateStops(stops, low / span);
  }

  return result;
}

export function resolveBiome({ elevation, moisture, temperature, peak }: BiomeInput): Biome {
  if (elevation >= VOLCANIC_MIN_ELEVATION && peak >= VOLCANIC_PEAK_THRESHOLD) {
    return 'volcanic';
  }
  if (elevation < 20) {
    return 'ocean';
  }
  if (elevation < 25) {
    return 'coast';
  }
  if (elevation >= 75) {
    return temperature < 0 ? 'tundra' : 'mountains';
  }
  if (elevation >= 50) {
    return 'mountains';
  }
  if (moisture >= 70 && elevation < 35 && temperature >= 5) {
    return 'swamp';
  }
  if (moisture > 60) {
    return 'forest';
  }
  if (moisture < 25) {
    return 'desert';
  }
  if (temperature < 0) {
    return 'tundra';
  }
  return 'plains';
}

/** Visual class: separates beaches, hills, high mountains and snow from biomes. */
export function resolveSurface(biome: Biome, elevation: number, temperature: number): Surface {
  if (elevation < SEA_LEVEL - 10) {
    return 'deepOcean';
  }
  if (elevation < SEA_LEVEL) {
    return 'shallowWater';
  }
  if (elevation < SEA_LEVEL + 3) {
    return 'beach';
  }
  if (biome === 'volcanic') {
    return 'volcanic';
  }
  if (biome === 'swamp') {
    return 'swamp';
  }
  if (biome === 'desert') {
    return 'desert';
  }
  if (elevation >= 94 || (elevation >= 86 && temperature < -2)) {
    return 'snow';
  }
  if (elevation >= 70) {
    return temperature < -6 ? 'snow' : 'mountains';
  }
  if (elevation >= 50) {
    return 'hills';
  }
  if (biome === 'tundra') {
    return 'tundra';
  }
  if (biome === 'forest') {
    return temperature < 3 ? 'taiga' : 'forest';
  }
  return 'plains';
}

function computeFertility(biome: Biome, moisture: number, temperature: number): number {
  const base = FERTILITY_BASE[biome];
  if (base === 0) {
    return 0;
  }
  const moistureFactor = 0.55 + (moisture / 100) * 0.45;
  const coldPenalty = temperature < 0 ? clamp(1 + temperature / 30, 0, 1) : 1;
  return Math.round(clamp(base * moistureFactor * coldPenalty, 0, 100));
}

function selectResource(biome: Biome, x: number, y: number, seed: number): ResourceType {
  const rules = RESOURCE_RULES[biome];
  if (rules.length === 0) {
    return 'none';
  }
  const roll = hash2D(x, y, seed);
  let threshold = 0;
  for (const rule of rules) {
    threshold += rule.chance;
    if (roll < threshold) {
      return rule.resource;
    }
  }
  return 'none';
}

export function generateWorld(
  seed: number,
  width: number = DEFAULT_WORLD_WIDTH,
  height: number = DEFAULT_WORLD_HEIGHT,
): World {
  const warpNoiseX = createNoise2D(seed * 13 + 1013);
  const warpNoiseY = createNoise2D(seed * 17 + 2027);
  const continentNoise = createNoise2D(seed);
  const mountainNoise = createNoise2D(seed * 3 + 4099);
  const moistureNoise = createNoise2D(seed * 2 + 7919);
  const detailNoise = createNoise2D(seed * 5 + 104729);

  const size = width * height;
  const rawElevation = new Float32Array(size);
  const rawMoisture = new Float32Array(size);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;

      // Domain warping: sample the continent noise at coordinates that are
      // themselves displaced by low frequency noise, which tears the coastline
      // into fjords, peninsulas and offshore islands.
      const warpX = fbm2D(warpNoiseX, x, y, WARP_FBM) * WARP_AMPLITUDE;
      const warpY = fbm2D(warpNoiseY, x, y, WARP_FBM) * WARP_AMPLITUDE;
      const sampleX = x + warpX;
      const sampleY = y + warpY;

      // No island mask: low frequency noise alone decides where the continents
      // are, so water runs off the map edges instead of wrapping a single blob.
      const continent = clamp((fbm2D(continentNoise, sampleX, sampleY, CONTINENT_FBM) + 1) / 2, 0, 1);
      const shaped = continent;

      // Ridged noise keeps mountain ranges narrow; they only rise inland.
      const ridge = ridgedFbm2D(mountainNoise, sampleX, sampleY, MOUNTAIN_FBM);
      const inland = smoothstep(0.45, 0.75, shaped);
      // Squaring the ridge narrows the crests into chains instead of plateaus.
      rawElevation[index] = shaped * CONTINENT_WEIGHT + ridge * ridge * RIDGE_WEIGHT * inland;

      rawMoisture[index] = (fbm2D(moistureNoise, sampleX, sampleY, MOISTURE_FBM) + 1) / 2;
    }
  }

  const elevationField = applyQuantiles(rawElevation, ELEVATION_STOPS);
  const moistureField = applyQuantiles(rawMoisture, MOISTURE_STOPS);

  // Micro relief is render-only: it feeds hillshading and flow routing but never
  // surface classification, so beaches stay clean bands instead of speckles.
  const reliefField = new Float32Array(size);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const meso = fbm2D(detailNoise, x, y, MESO_FBM) * MESO_RELIEF;
      const micro = fbm2D(detailNoise, x * 3.1, y * 3.1, MICRO_FBM) * MICRO_RELIEF;
      reliefField[index] = clamp((elevationField[index] ?? 0) + meso + micro, 0, 100);
    }
  }

  const tiles: Tile[][] = [];
  const temperatureField = new Float32Array(size);

  for (let y = 0; y < height; y += 1) {
    const row: Tile[] = [];
    const latitude = height > 1 ? Math.abs(y / (height - 1) - 0.5) * 2 : 0;
    const polarCold = Math.pow(latitude, 1.9) * 38;

    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const elevation = elevationField[index] ?? 0;
      const moisture = moistureField[index] ?? 0;
      const temperature =
        Math.round(
          (30 - polarCold - elevation * 0.13 + fbm2D(detailNoise, x, y, DETAIL_FBM) * 3.5) * 10,
        ) / 10;
      temperatureField[index] = temperature;
      const peak = 1 - Math.abs(detailNoise(x * 0.12, y * 0.12));
      const biome = resolveBiome({ elevation, moisture, temperature, peak });

      row.push({
        elevation: Math.round(elevation * 10) / 10,
        moisture: Math.round(moisture * 10) / 10,
        temperature,
        fertility: computeFertility(biome, moisture, temperature),
        biome,
        surface: resolveSurface(biome, elevation, temperature),
        river: false,
        resource: selectResource(biome, x, y, seed),
        ownerId: null,
        provinceId: -1,
      });
    }

    tiles.push(row);
  }

  const hydrology = computeHydrology({
    elevation: reliefField,
    width,
    height,
    seaLevel: SEA_LEVEL,
    seed,
    meander: RIVER_MEANDER,
    riverThreshold: RIVER_THRESHOLD,
  });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (hydrology.riverTiles[y * width + x] !== 1) {
        continue;
      }
      const tile = tiles[y]?.[x];
      if (tile === undefined) {
        continue;
      }
      tile.river = true;
      tile.moisture = Math.min(100, Math.max(tile.moisture, 74));
      tile.fertility = Math.min(100, tile.fertility + 10);
      if (tile.biome === 'desert') {
        tile.biome = 'plains';
        tile.surface = 'plains';
      }
    }
  }

  const provinces = generateProvinces({
    tiles,
    width,
    height,
    seed,
    targetCount: PROVINCE_TARGET_COUNT,
    minSeedSpacing: PROVINCE_SEED_SPACING,
    maxCost: PROVINCE_MAX_COST,
  });

  return {
    width,
    height,
    seed,
    tiles,
    tick: 0,
    provinces,
    elevationMap: elevationField,
    moistureMap: moistureField,
    temperatureMap: temperatureField,
    reliefMap: reliefField,
    flowAccumulation: hydrology.flowAccumulation,
    flowDownstream: hydrology.flowDownstream,
  };
}

import type { Biome, ResourceType, Tile, World } from '../types/world';
import { createNoise2D, hash2D, type Noise2D } from './noise';

export const DEFAULT_WORLD_WIDTH = 150;
export const DEFAULT_WORLD_HEIGHT = 100;

const ELEVATION_FREQUENCY = 0.014;
const MOISTURE_FREQUENCY = 0.026;
const DETAIL_FREQUENCY = 0.09;

const VOLCANIC_MIN_ELEVATION = 88;
const VOLCANIC_PEAK_THRESHOLD = 0.94;

interface FbmConfig {
  readonly octaves: number;
  readonly frequency: number;
  readonly lacunarity: number;
  readonly gain: number;
}

const ELEVATION_FBM: FbmConfig = { octaves: 4, frequency: ELEVATION_FREQUENCY, lacunarity: 2, gain: 0.5 };
const MOISTURE_FBM: FbmConfig = { octaves: 3, frequency: MOISTURE_FREQUENCY, lacunarity: 2, gain: 0.5 };

interface QuantileStop {
  /** Share of tiles at or below this value, 0..1 */
  readonly at: number;
  /** Output value at this quantile, 0..100 */
  readonly value: number;
}

/** Elevation distribution: ~38% ocean, ~7% coast, wide midland band, few peaks. */
const ELEVATION_STOPS: readonly QuantileStop[] = [
  { at: 0, value: 0 },
  { at: 0.38, value: 20 },
  { at: 0.45, value: 25 },
  { at: 0.7, value: 38 },
  { at: 0.86, value: 50 },
  { at: 0.97, value: 78 },
  { at: 1, value: 100 },
];

/** Moisture distribution: dry quarter, balanced midland, wet quarter. */
const MOISTURE_STOPS: readonly QuantileStop[] = [
  { at: 0, value: 0 },
  { at: 0.2, value: 25 },
  { at: 0.55, value: 50 },
  { at: 0.68, value: 62 },
  { at: 1, value: 100 },
];

export interface BiomeInput {
  readonly elevation: number;
  readonly moisture: number;
  readonly temperature: number;
  /** 0..1, higher means a sharper and rarer peak */
  readonly peak: number;
}

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fbm2D(noise: Noise2D, x: number, y: number, config: FbmConfig): number {
  let amplitude = 1;
  let frequency = config.frequency;
  let total = 0;
  let normalization = 0;

  for (let octave = 0; octave < config.octaves; octave += 1) {
    total += noise(x * frequency, y * frequency) * amplitude;
    normalization += amplitude;
    amplitude *= config.gain;
    frequency *= config.lacunarity;
  }

  return total / normalization;
}

function continentMask(normalizedX: number, normalizedY: number): number {
  const dx = (normalizedX - 0.5) * 2;
  const dy = (normalizedY - 0.5) * 2;
  const distance = Math.min(1, Math.sqrt(dx * dx * 0.85 + dy * dy * 0.85));
  return 1 - Math.pow(distance, 2.6);
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
  const elevationNoise = createNoise2D(seed);
  const moistureNoise = createNoise2D(seed * 2 + 7919);
  const detailNoise = createNoise2D(seed * 3 + 104729);

  const size = width * height;
  const rawElevation = new Float32Array(size);
  const rawMoisture = new Float32Array(size);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const continent = continentMask(x / width, y / height);
      const land = (fbm2D(elevationNoise, x, y, ELEVATION_FBM) + 1) / 2;
      rawElevation[index] = land * continent;
      rawMoisture[index] = (fbm2D(moistureNoise, x, y, MOISTURE_FBM) + 1) / 2;
    }
  }

  const elevationField = applyQuantiles(rawElevation, ELEVATION_STOPS);
  const moistureField = applyQuantiles(rawMoisture, MOISTURE_STOPS);
  const tiles: Tile[][] = [];

  for (let y = 0; y < height; y += 1) {
    const row: Tile[] = [];
    const latitude = height > 1 ? y / (height - 1) : 0;
    const latitudeCold = Math.pow(latitude, 2.4) * 62;

    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const elevation = elevationField[index] ?? 0;
      const moisture = moistureField[index] ?? 0;
      const temperature =
        Math.round((30 - latitudeCold - (elevation / 100) * 12 + detailNoise(x * 0.06, y * 0.06) * 2.5) * 10) /
        10;
      const peak = 1 - Math.abs(detailNoise(x * DETAIL_FREQUENCY, y * DETAIL_FREQUENCY));
      const biome = resolveBiome({ elevation, moisture, temperature, peak });

      row.push({
        elevation: Math.round(elevation * 10) / 10,
        moisture: Math.round(moisture * 10) / 10,
        temperature,
        fertility: computeFertility(biome, moisture, temperature),
        biome,
        resource: selectResource(biome, x, y, seed),
        ownerId: null,
      });
    }

    tiles.push(row);
  }

  return {
    width,
    height,
    seed,
    tiles,
    tick: 0,
  };
}
